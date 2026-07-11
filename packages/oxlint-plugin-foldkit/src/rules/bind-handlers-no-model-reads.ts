import { Array, Effect, Option, pipe } from 'effect'
import { Diagnostic, type ESTree, Rule, RuleContext } from 'effect-oxlint'

import {
  type BindImports,
  type FunctionLikeNode,
  childValuesOf,
  isEstreeNode,
  isFunctionLikeNode,
  isModelIdentifier,
  isOnConstructorCallee,
  resolveBindImports,
} from '../bind-guards.ts'
import { isCallExpression, isIdentifier, isProgram } from '../guards.ts'

const modelReadInHandlerMessage =
  'This `on()` handler reads the Model. Handlers run later, against whatever the Model has become by the time the event fires, so a Model-derived value here is stale by the time it is used. Derive the Message payload from the event itself, or from a value captured before the handler was defined.'

type Offense = Readonly<{ node: ESTree.Node; message: string }>

const handlerFunctionArgument = (
  node: ESTree.CallExpression,
): Option.Option<FunctionLikeNode> =>
  pipe(
    Array.get(node.arguments, 1),
    Option.filter(
      (argument): argument is FunctionLikeNode =>
        argument.type !== 'SpreadElement' && isFunctionLikeNode(argument),
    ),
  )

const shadowsModelParameter = (handler: FunctionLikeNode): boolean =>
  handler.params.some(
    (parameter: ESTree.Node) =>
      isIdentifier(parameter) && isModelIdentifier(parameter),
  )

const modelReadOffensesInHandlerBody = (
  value: unknown,
): ReadonlyArray<Offense> => {
  if (Array.isArray(value)) {
    return Array.flatMap(value, element =>
      modelReadOffensesInHandlerBody(element),
    )
  }
  if (!isEstreeNode(value)) {
    return []
  }
  if (isModelIdentifier(value)) {
    return [{ node: value, message: modelReadInHandlerMessage }]
  }
  return Array.flatMap(childValuesOf(value), child =>
    modelReadOffensesInHandlerBody(child),
  )
}

const handlerOffenses = (
  node: ESTree.CallExpression,
  bindImports: BindImports,
): ReadonlyArray<Offense> => {
  if (!isOnConstructorCallee(node.callee, bindImports)) {
    return []
  }
  return pipe(
    handlerFunctionArgument(node),
    Option.filter(handler => !shadowsModelParameter(handler)),
    Option.match({
      onNone: () => [],
      onSome: handler => modelReadOffensesInHandlerBody(handler.body),
    }),
  )
}

const collectOffenses = (
  value: unknown,
  bindImports: BindImports,
): ReadonlyArray<Offense> => {
  if (Array.isArray(value)) {
    return Array.flatMap(value, element =>
      collectOffenses(element, bindImports),
    )
  }
  if (!isEstreeNode(value)) {
    return []
  }
  const ownOffenses = isCallExpression(value)
    ? handlerOffenses(value, bindImports)
    : []
  const childOffenses = Array.flatMap(childValuesOf(value), child =>
    collectOffenses(child, bindImports),
  )
  return [...ownOffenses, ...childOffenses]
}

/**
 * Flags any reference to the Model parameter from inside an `on(event,
 * handler)` handler body within binding construction. A handler runs on a
 * later event, potentially long after the binding tree that closed over it
 * was built, so a Model-derived value read at handler-definition time (or
 * even freshly re-read from the closed-over Model reference) reflects
 * whichever Model snapshot happened to be in scope, not the Model at the
 * moment the event actually fires. Handlers must derive their Message
 * payload from the event parameter or from values captured before the
 * handler was defined that do not themselves come from the Model (stable
 * keys, item identifiers passed in from an enclosing `list` renderItem,
 * and so on).
 *
 * A handler that declares its own parameter literally named `model`
 * (shadowing the outer Model, though the constructor signature is
 * `(event: Event) => Message` and never actually supplies one) is exempt:
 * that identifier is not the outer Model.
 *
 * Only fires in files that import binding constructors from an
 * `.../experimental/bind` module or the `Bind` namespace re-exported from
 * `foldkit/experimental`; see `bind-guards.ts` for the shared detection
 * heuristic and its known false negatives (a renamed Model parameter is
 * invisible to this check, since it targets the literal identifier
 * `model`).
 */
export const bindHandlersNoModelReads = Rule.define({
  name: 'bind-handlers-no-model-reads',
  meta: Rule.meta({
    type: 'problem',
    description:
      'Derive on() handler Messages from the event, not from the Model, to avoid stale reads.',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      'Program:exit': (node: ESTree.Node) => {
        if (!isProgram(node)) {
          return Effect.void
        }
        const bindImports = resolveBindImports(node)
        const offenses = collectOffenses(node, bindImports)
        return Effect.forEach(
          offenses,
          offense => ctx.report(Diagnostic.make(offense)),
          { discard: true },
        )
      },
    }
  },
})
