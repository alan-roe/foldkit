import { Array, Option, pipe } from 'effect'
import { AST, type ESTree } from 'effect-oxlint'

import { isIdentifier, isMemberExpression } from './guards.ts'

/**
 * Canonical names of binding constructors whose argument position accepts a
 * `Bound<Model, A>` thunk (`(model: Model) => A` or, in practice, a
 * zero-argument closure that reads the enclosing `model` binding). `el` and
 * `on` are intentionally excluded: `el` never takes a thunk directly, and
 * `on` handlers are policed by `bind-handlers-no-model-reads` instead.
 */
export const BOUND_ARGUMENT_CONSTRUCTOR_NAMES: ReadonlySet<string> = new Set([
  'text',
  'attr',
  'list',
  'cond',
  'when',
  'matchTag',
])

const BIND_MODULE_SOURCE_PATTERN = /\/experimental\/bind(\/|$)/
const BIND_PUBLIC_SURFACE_SOURCE_PATTERN = /(^|\/)experimental$/

const isBindModuleSource = (source: string): boolean =>
  BIND_MODULE_SOURCE_PATTERN.test(source)

const isBindPublicSurfaceSource = (source: string): boolean =>
  BIND_PUBLIC_SURFACE_SOURCE_PATTERN.test(source)

const moduleExportName = (node: ESTree.Node): Option.Option<string> => {
  if (isIdentifier(node)) {
    return Option.some(node.name)
  }
  if ('value' in node && typeof node.value === 'string') {
    return Option.some(node.value)
  }
  return Option.none()
}

/**
 * Bind import bindings resolved from a Program's top-level `import`
 * statements: local identifier names that resolve to a binding constructor
 * (either imported directly by name, e.g. `import { text } from
 * '.../experimental/bind/public.ts'`, or reached through a namespace, e.g.
 * `import { Bind } from 'foldkit/experimental'` used as `Bind.text(...)`).
 *
 * Known false negative: re-exported or renamed indirection through an
 * intermediate module (a project-local `bind.ts` that re-exports the
 * constructors) is invisible to this single-file import scan.
 */
export type BindImports = Readonly<{
  constructorLocalNames: ReadonlyMap<string, string>
  onLocalName: Option.Option<string>
  namespaceLocalNames: ReadonlySet<string>
}>

export const EMPTY_BIND_IMPORTS: BindImports = {
  constructorLocalNames: new Map(),
  onLocalName: Option.none(),
  namespaceLocalNames: new Set(),
}

/** Whether any bind construction surface was found in the file. */
export const hasBindImports = (bindImports: BindImports): boolean =>
  bindImports.constructorLocalNames.size > 0 ||
  Option.isSome(bindImports.onLocalName) ||
  bindImports.namespaceLocalNames.size > 0

const specifierEntries = (
  declaration: ESTree.ImportDeclaration,
): ReadonlyArray<
  | Readonly<{ kind: 'named'; imported: string; local: string }>
  | Readonly<{ kind: 'namespace'; local: string }>
> =>
  pipe(
    declaration.specifiers,
    Array.flatMap(specifier => {
      if (specifier.type === 'ImportNamespaceSpecifier') {
        return [{ kind: 'namespace' as const, local: specifier.local.name }]
      }
      if (specifier.type === 'ImportSpecifier') {
        return pipe(
          moduleExportName(specifier.imported),
          Option.map(imported => ({
            kind: 'named' as const,
            imported,
            local: specifier.local.name,
          })),
          Option.match({ onNone: () => [], onSome: entry => [entry] }),
        )
      }
      return []
    }),
  )

const foldImportDeclaration = (
  bindImports: BindImports,
  declaration: ESTree.ImportDeclaration,
): BindImports => {
  const source = AST.importSource(declaration)
  const entries = specifierEntries(declaration)
  const fromBindModule = isBindModuleSource(source)
  const fromPublicSurface = isBindPublicSurfaceSource(source)
  if (!fromBindModule && !fromPublicSurface) {
    return bindImports
  }
  return entries.reduce((accumulated, entry): BindImports => {
    if (entry.kind === 'namespace') {
      return fromBindModule
        ? {
            ...accumulated,
            namespaceLocalNames: new Set([
              ...accumulated.namespaceLocalNames,
              entry.local,
            ]),
          }
        : accumulated
    }
    if (fromPublicSurface && entry.imported === 'Bind') {
      return {
        ...accumulated,
        namespaceLocalNames: new Set([
          ...accumulated.namespaceLocalNames,
          entry.local,
        ]),
      }
    }
    if (!fromBindModule) {
      return accumulated
    }
    if (entry.imported === 'on') {
      return { ...accumulated, onLocalName: Option.some(entry.local) }
    }
    if (BOUND_ARGUMENT_CONSTRUCTOR_NAMES.has(entry.imported)) {
      return {
        ...accumulated,
        constructorLocalNames: new Map([
          ...accumulated.constructorLocalNames,
          [entry.local, entry.imported],
        ]),
      }
    }
    return accumulated
  }, bindImports)
}

/** Resolve every bind import binding declared at the top of a Program. */
export const resolveBindImports = (program: ESTree.Program): BindImports =>
  pipe(
    program.body,
    Array.filter(
      (statement): statement is ESTree.ImportDeclaration =>
        statement.type === 'ImportDeclaration',
    ),
    Array.reduce(EMPTY_BIND_IMPORTS, foldImportDeclaration),
  )

/**
 * Canonical binding constructor name a `CallExpression` callee resolves to,
 * given the file's resolved bind imports. Handles both direct calls
 * (`text(...)`) and namespace calls (`Bind.text(...)`).
 */
export const resolveBoundConstructorName = (
  callee: ESTree.Node,
  bindImports: BindImports,
): Option.Option<string> => {
  if (isIdentifier(callee)) {
    return Option.fromNullishOr(
      bindImports.constructorLocalNames.get(callee.name),
    )
  }
  if (
    isMemberExpression(callee) &&
    !callee.computed &&
    isIdentifier(callee.object) &&
    isIdentifier(callee.property) &&
    bindImports.namespaceLocalNames.has(callee.object.name) &&
    BOUND_ARGUMENT_CONSTRUCTOR_NAMES.has(callee.property.name)
  ) {
    return Option.some(callee.property.name)
  }
  return Option.none()
}

/** Whether a `CallExpression` callee resolves to the `on(...)` constructor. */
export const isOnConstructorCallee = (
  callee: ESTree.Node,
  bindImports: BindImports,
): boolean => {
  if (
    isIdentifier(callee) &&
    Option.exists(bindImports.onLocalName, name => name === callee.name)
  ) {
    return true
  }
  return (
    isMemberExpression(callee) &&
    !callee.computed &&
    isIdentifier(callee.object) &&
    isIdentifier(callee.property, 'on') &&
    bindImports.namespaceLocalNames.has(callee.object.name)
  )
}

const MODEL_PARAMETER_NAME = 'model'

/** Whether an identifier is the conventional Model parameter reference. */
export const isModelIdentifier = (node: ESTree.Node): boolean =>
  isIdentifier(node, MODEL_PARAMETER_NAME)

/**
 * Whether an expression reads from the Model, directly (`model`) or through
 * a member access chain rooted at it (`model.count`, `model.user.name`).
 *
 * Known false negative: only the literal identifier name `model` is
 * recognized. A renamed parameter (`(store) => store.count`) or a
 * destructured intermediate (`const { user } = model; user.name`) defeats
 * this check.
 */
export const isModelRead = (node: ESTree.Node): boolean => {
  if (isModelIdentifier(node)) {
    return true
  }
  if (isMemberExpression(node) && !node.computed) {
    return isModelRead(node.object)
  }
  return false
}

/** A function node, whichever concrete shape it takes. */
export type FunctionLikeNode = ESTree.ArrowFunctionExpression | ESTree.Function

export const isFunctionLikeNode = (
  node: ESTree.Node,
): node is FunctionLikeNode =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration'

const firstParameterName = (
  functionNode: FunctionLikeNode,
): Option.Option<string> =>
  pipe(
    Array.head(functionNode.params),
    Option.flatMap(parameter =>
      isIdentifier(parameter) ? Option.some(parameter.name) : Option.none(),
    ),
  )

/** Whether a function's first parameter is literally named `model`. */
export const isModelFunction = (functionNode: FunctionLikeNode): boolean =>
  Option.exists(
    firstParameterName(functionNode),
    name => name === MODEL_PARAMETER_NAME,
  )

/** Every non-`parent` child value of an AST node, for generic recursion. */
export const childValuesOf = (node: ESTree.Node): ReadonlyArray<unknown> =>
  pipe(
    Object.entries(node),
    Array.flatMap(([key, value]) => (key === 'parent' ? [] : [value])),
  )

export const isEstreeNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  typeof (value as Readonly<{ type: unknown }>).type === 'string'
