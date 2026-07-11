import { Array, Effect, Option, pipe } from 'effect'
import { Diagnostic, type ESTree, Rule, RuleContext } from 'effect-oxlint'

import {
  type BindImports,
  childValuesOf,
  isEstreeNode,
  isFunctionLikeNode,
  isModelFunction,
  isModelRead,
  resolveBindImports,
  resolveBoundConstructorName,
} from '../bind-guards.ts'
import { isCallExpression, isIdentifier, isProgram } from '../guards.ts'

const DIRECT_READ_MESSAGE =
  'This Model read is passed directly into a binding argument instead of a thunk. The value is captured once when the binding tree is built, so the rendered node never updates when the Model changes. Wrap it in a thunk: () => model.field.'

const capturedReadMessage = (localName: string): string =>
  `\`${localName}\` was read from the Model outside a thunk, so it is a frozen snapshot from when the binding tree was built. Passing it to a binding argument, even inside an arrow function, does not make the read live: the arrow closes over \`${localName}\`, not over the Model. Read the Model field inside the thunk body instead: () => model.field.`

type Offense = Readonly<{ node: ESTree.Node; message: string }>

type WalkContext = Readonly<{
  bindImports: BindImports
  withinModelFunction: boolean
  insideThunk: boolean
  insideBoundArgument: boolean
  eagerModelReadNames: ReadonlyMap<string, ESTree.Node>
}>

const eagerNamesFromDeclaratorId = (id: ESTree.Node): ReadonlyArray<string> => {
  if (isIdentifier(id)) {
    return [id.name]
  }
  if (id.type === 'ObjectPattern') {
    return pipe(
      id.properties,
      Array.flatMap(property =>
        property.type === 'Property' &&
        !property.computed &&
        isIdentifier(property.value)
          ? [property.value.name]
          : [],
      ),
    )
  }
  return []
}

const eagerNamesIntroducedBy = (
  statement: unknown,
  ctx: WalkContext,
): ReadonlyMap<string, ESTree.Node> => {
  if (
    ctx.insideThunk ||
    !ctx.withinModelFunction ||
    !isEstreeNode(statement) ||
    statement.type !== 'VariableDeclaration'
  ) {
    return new Map()
  }
  return pipe(
    statement.declarations,
    Array.flatMap(declarator =>
      declarator.init !== null && isModelRead(declarator.init)
        ? pipe(
            eagerNamesFromDeclaratorId(declarator.id),
            Array.map((name): readonly [string, ESTree.Node] => [
              name,
              declarator,
            ]),
          )
        : [],
    ),
    entries => new Map(entries),
  )
}

const boundCallArgumentOffenses = (
  node: ESTree.CallExpression,
  ctx: WalkContext,
): ReadonlyArray<Offense> => {
  const argumentOffenses = Array.flatMap(node.arguments, argument => {
    const isThunkArgument =
      argument.type !== 'SpreadElement' && isFunctionLikeNode(argument)
    return collectOffenses(argument, {
      ...ctx,
      insideBoundArgument: true,
      insideThunk: ctx.insideThunk || isThunkArgument,
    })
  })
  return [...argumentOffenses, ...collectOffenses(node.callee, ctx)]
}

const collectOffenses = (
  value: unknown,
  ctx: WalkContext,
): ReadonlyArray<Offense> => {
  if (Array.isArray(value)) {
    const result = Array.reduce(
      value,
      { offenses: [] as ReadonlyArray<Offense>, ctx },
      (acc, element) => {
        const elementOffenses = collectOffenses(element, acc.ctx)
        const introducedNames = eagerNamesIntroducedBy(element, acc.ctx)
        const nextCtx: WalkContext =
          introducedNames.size > 0
            ? {
                ...acc.ctx,
                eagerModelReadNames: new Map([
                  ...acc.ctx.eagerModelReadNames,
                  ...introducedNames,
                ]),
              }
            : acc.ctx
        return {
          offenses: [...acc.offenses, ...elementOffenses],
          ctx: nextCtx,
        }
      },
    )
    return result.offenses
  }
  if (!isEstreeNode(value)) {
    return []
  }

  if (isCallExpression(value) && ctx.withinModelFunction) {
    const maybeConstructorName = resolveBoundConstructorName(
      value.callee,
      ctx.bindImports,
    )
    if (Option.isSome(maybeConstructorName)) {
      return boundCallArgumentOffenses(value, ctx)
    }
  }

  if (ctx.insideBoundArgument && !ctx.insideThunk && isModelRead(value)) {
    return [{ node: value, message: DIRECT_READ_MESSAGE }]
  }

  const ownOffenses: ReadonlyArray<Offense> =
    isIdentifier(value) &&
    ctx.insideBoundArgument &&
    ctx.eagerModelReadNames.has(value.name)
      ? [{ node: value, message: capturedReadMessage(value.name) }]
      : []

  const nextWithinModelFunction =
    ctx.withinModelFunction ||
    (isFunctionLikeNode(value) && isModelFunction(value))
  const declaredEagerNames = eagerNamesIntroducedBy(value, ctx)
  const childCtx: WalkContext = {
    ...ctx,
    withinModelFunction: nextWithinModelFunction,
    eagerModelReadNames:
      declaredEagerNames.size > 0
        ? new Map([...ctx.eagerModelReadNames, ...declaredEagerNames])
        : ctx.eagerModelReadNames,
  }
  const childOffenses = Array.flatMap(childValuesOf(value), child =>
    collectOffenses(child, childCtx),
  )
  return [...ownOffenses, ...childOffenses]
}

/**
 * Flags Model reads that reach a binding constructor's `Bound<Model, A>`
 * argument (`text`, `attr`, `list`, `cond`, `when`, `matchTag`) without
 * being read live inside a thunk. Two shapes are caught:
 *
 * 1. A direct, unwrapped Model read passed as the argument itself, for
 *    example `text(model.count)`.
 * 2. The canonical staleness bug: `const count = model.count` earlier in
 *    the same Model-parameterized function, with `count` later referenced
 *    from a binding argument, for example `text(() => count)`. The arrow
 *    looks like a thunk but closes over the already-captured snapshot, not
 *    over a live Model read, so the rendered node freezes at its initial
 *    value.
 *
 * Reads performed inside a thunk body (`text(() => model.count)`) are the
 * correct, live pattern and are never flagged, nor is any code in a file
 * that does not import bind constructors from an `.../experimental/bind`
 * module or the `Bind` namespace re-exported from `foldkit/experimental`.
 *
 * Known false negatives (see `bind-guards.ts` for the detection
 * heuristic): a renamed Model parameter, a Model parameter destructured
 * directly in the function signature (`({ count }) => ...`), a destructured
 * intermediate more than one property deep, indirection through a helper
 * function that itself reads the Model, or re-exported binding
 * constructors from a project-local wrapper module.
 */
export const noEagerBindReads = Rule.define({
  name: 'no-eager-bind-reads',
  meta: Rule.meta({
    type: 'problem',
    description:
      'Read the Model inside a binding thunk body, not outside it, so bindings stay live.',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      'Program:exit': (node: ESTree.Node) => {
        if (!isProgram(node)) {
          return Effect.void
        }
        const bindImports = resolveBindImports(node)
        const offenses = collectOffenses(node, {
          bindImports,
          withinModelFunction: false,
          insideThunk: false,
          insideBoundArgument: false,
          eagerModelReadNames: new Map(),
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
