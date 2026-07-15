import { Array, Effect, Option, pipe } from 'effect'
import { AST, Diagnostic, type ESTree, Rule, RuleContext } from 'effect-oxlint'

import {
  type BindImports,
  childValuesOf,
  isEstreeNode,
  resolveBindImports,
} from '../bind-guards.ts'
import {
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isProgram,
  isStringLiteral,
} from '../guards.ts'

const DERIVED_MODULE_SOURCE_PATTERN = /\/experimental\/reactive\/derived(\.|$)/
const BIND_MODULE_SOURCE_PATTERN = /\/experimental\/bind(\/|$)/
const PUBLIC_SURFACE_SOURCE_PATTERN = /(^|\/)experimental$/

/**
 * Canonical names of the binding constructors that take a
 * render-per-item/branch function: calling `derived()` from inside a
 * function reachable through one of these calls' arguments mints a fresh
 * computed on every row/branch/render instead of once at module load.
 */
const VIEW_CONSTRUCTOR_NAMES: ReadonlySet<string> = new Set([
  'list',
  'cond',
  'when',
  'matchTag',
  'submodel',
])

/**
 * Object property names whose value is, by Foldkit convention, itself a
 * binding-constructing function even when not reached through one of
 * `VIEW_CONSTRUCTOR_NAMES`'s calls directly (a Submodel's `viewInputs`
 * shape, or a locally named renderer passed around before being wired up).
 */
const FLAGGED_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'toView',
  'renderItem',
  'renderBranch',
])

const perCallComputedMessage =
  '`derived(...)` was called inside a binding-constructing function (a `list`/`cond`/`when`/`matchTag`/`submodel` argument, or a `toView`/`renderItem`/`renderBranch` property, or a function nested inside one of those). This function re-runs on every row, branch, or render, so each call mints a fresh computed that outlives the row or branch it was created for and accumulates until the store is torn down - the exact leak the TodoMVC clear/re-add churn stresses. Declare `derived` once at module scope, next to the Model it derives from, and reference the resulting binding from inside the view instead.'

type Offense = Readonly<{ node: ESTree.Node; message: string }>

type ImportedSpecifierName = Readonly<{ imported: string; local: string }>

const importedSpecifierEntries = (
  declaration: ESTree.ImportDeclaration,
): ReadonlyArray<ImportedSpecifierName> =>
  pipe(
    declaration.specifiers,
    Array.flatMap(specifier => {
      if (specifier.type !== 'ImportSpecifier') {
        return []
      }
      const importedNode = specifier.imported
      if (isIdentifier(importedNode)) {
        return [{ imported: importedNode.name, local: specifier.local.name }]
      }
      if (isStringLiteral(importedNode)) {
        return [{ imported: importedNode.value, local: specifier.local.name }]
      }
      return []
    }),
  )

/**
 * Local identifier names bound to `importedName` by a named import (with or
 * without aliasing) whose source matches one of `sourcePatterns`.
 *
 * Known false negative, matching `bind-guards.ts`'s heuristic: a
 * re-exported or renamed indirection through an intermediate module is
 * invisible to this single-file import scan.
 */
const namedImportLocalNames = (
  program: ESTree.Program,
  importedName: string,
  sourcePatterns: ReadonlyArray<RegExp>,
): ReadonlySet<string> =>
  pipe(
    program.body,
    Array.filter(
      (statement): statement is ESTree.ImportDeclaration =>
        statement.type === 'ImportDeclaration',
    ),
    Array.filter(declaration =>
      sourcePatterns.some(pattern =>
        pattern.test(AST.importSource(declaration)),
      ),
    ),
    Array.flatMap(importedSpecifierEntries),
    Array.filter(entry => entry.imported === importedName),
    Array.map(entry => entry.local),
    names => new Set(names),
  )

type ViewImports = Readonly<{
  bindImports: BindImports
  submodelLocalNames: ReadonlySet<string>
  derivedLocalNames: ReadonlySet<string>
}>

const resolveViewImports = (program: ESTree.Program): ViewImports => ({
  bindImports: resolveBindImports(program),
  submodelLocalNames: namedImportLocalNames(program, 'submodel', [
    BIND_MODULE_SOURCE_PATTERN,
  ]),
  derivedLocalNames: namedImportLocalNames(program, 'derived', [
    DERIVED_MODULE_SOURCE_PATTERN,
    PUBLIC_SURFACE_SOURCE_PATTERN,
  ]),
})

/**
 * Canonical view-constructor name (`list`, `cond`, `when`, `matchTag`,
 * `submodel`) a `CallExpression` callee resolves to, given the file's
 * resolved imports. Handles both direct calls (`list(...)`) and namespace
 * calls (`Bind.list(...)`, `Bind.submodel(...)`).
 */
const resolveViewConstructorName = (
  callee: ESTree.Node,
  imports: ViewImports,
): Option.Option<string> => {
  if (isIdentifier(callee)) {
    const constructorName = imports.bindImports.constructorLocalNames.get(
      callee.name,
    )
    if (
      constructorName !== undefined &&
      VIEW_CONSTRUCTOR_NAMES.has(constructorName)
    ) {
      return Option.some(constructorName)
    }
    if (imports.submodelLocalNames.has(callee.name)) {
      return Option.some('submodel')
    }
    return Option.none()
  }
  if (
    isMemberExpression(callee) &&
    !callee.computed &&
    isIdentifier(callee.object) &&
    isIdentifier(callee.property) &&
    imports.bindImports.namespaceLocalNames.has(callee.object.name) &&
    VIEW_CONSTRUCTOR_NAMES.has(callee.property.name)
  ) {
    return Option.some(callee.property.name)
  }
  return Option.none()
}

const isDerivedCallee = (callee: ESTree.Node, imports: ViewImports): boolean =>
  isIdentifier(callee) && imports.derivedLocalNames.has(callee.name)

type PropertyLikeNode = Readonly<{
  type: 'Property'
  computed?: boolean
  key: ESTree.Node
  value: unknown
}>

const isPropertyLikeNode = (value: unknown): value is PropertyLikeNode =>
  isEstreeNode(value) &&
  value.type === 'Property' &&
  'key' in value &&
  'value' in value

const propertyKeyName = (property: PropertyLikeNode): Option.Option<string> => {
  if (property.computed === true) {
    return Option.none()
  }
  if (isIdentifier(property.key)) {
    return Option.some(property.key.name)
  }
  if (isStringLiteral(property.key)) {
    return Option.some(property.key.value)
  }
  return Option.none()
}

const isFlaggedProperty = (value: unknown): value is PropertyLikeNode =>
  isPropertyLikeNode(value) &&
  Option.exists(propertyKeyName(value), name =>
    FLAGGED_PROPERTY_NAMES.has(name),
  )

type WalkContext = Readonly<{
  imports: ViewImports
  insideFlaggedRegion: boolean
}>

const collectOffenses = (
  value: unknown,
  ctx: WalkContext,
): ReadonlyArray<Offense> => {
  if (Array.isArray(value)) {
    return Array.flatMap(value, element => collectOffenses(element, ctx))
  }
  if (!isEstreeNode(value)) {
    return []
  }

  if (isCallExpression(value)) {
    const ownOffense: ReadonlyArray<Offense> =
      ctx.insideFlaggedRegion && isDerivedCallee(value.callee, ctx.imports)
        ? [{ node: value, message: perCallComputedMessage }]
        : []
    const constructorName = resolveViewConstructorName(
      value.callee,
      ctx.imports,
    )
    if (Option.isSome(constructorName)) {
      const argumentOffenses = Array.flatMap(value.arguments, argument =>
        collectOffenses(argument, { ...ctx, insideFlaggedRegion: true }),
      )
      const calleeOffenses = collectOffenses(value.callee, ctx)
      return [...ownOffense, ...argumentOffenses, ...calleeOffenses]
    }
    const childOffenses = Array.flatMap(childValuesOf(value), child =>
      collectOffenses(child, ctx),
    )
    return [...ownOffense, ...childOffenses]
  }

  if (isFlaggedProperty(value)) {
    const valueOffenses = collectOffenses(value.value, {
      ...ctx,
      insideFlaggedRegion: true,
    })
    const keyOffenses = collectOffenses(value.key, ctx)
    return [...valueOffenses, ...keyOffenses]
  }

  return Array.flatMap(childValuesOf(value), child =>
    collectOffenses(child, ctx),
  )
}

/**
 * Flags `derived(...)` calls made lexically inside a binding-constructing
 * function: a function reachable through the arguments of a `list`,
 * `cond`, `when`, `matchTag`, or `submodel` call; an object property value
 * named `toView`, `renderItem`, or `renderBranch`; or any function nested
 * inside one of those (a helper arrow declared inside `renderItem`, for
 * example). Each such function re-runs on every row, branch, or render
 * pass, so a `derived()` call inside it mints a fresh computed every time -
 * a leak, not an error, since nothing about the call fails.
 *
 * `derived` is legal at module scope, the intended usage, and inside a
 * plain top-level factory function that is itself never passed to one of
 * the five constructors above and never assigned to a `toView`/
 * `renderItem`/`renderBranch` property.
 *
 * Only fires in files that import `derived` from
 * `.../experimental/reactive/derived` or the `foldkit/experimental` public
 * surface. Known false negatives, matching `bind-guards.ts`'s detection
 * heuristic: a re-exported or renamed indirection through an intermediate
 * module is invisible to this single-file import scan, as is a `submodel`
 * or `derived` reached only through a project-local wrapper.
 */
export const noDerivedInViewBodies = Rule.define({
  name: 'no-derived-in-view-bodies',
  meta: Rule.meta({
    type: 'problem',
    description:
      'Declare `derived` at module scope; calling it inside a view body, renderItem, renderBranch, toView, or a list/cond/when/matchTag/submodel argument leaks a computed per call.',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      'Program:exit': (node: ESTree.Node) => {
        if (!isProgram(node)) {
          return Effect.void
        }
        const imports = resolveViewImports(node)
        const offenses = collectOffenses(node, {
          imports,
          insideFlaggedRegion: false,
        })
        return Effect.forEach(
          offenses,
          offense => ctx.report(Diagnostic.make(offense)),
          { discard: true },
        )
      },
    }
  },
})
