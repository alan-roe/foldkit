import { Match as M } from 'effect'

import type { AttrBinding, Binding } from './binding.js'

// MATERIALIZED NODE

/** A materialized element: every static and bound attribute already
 *  force-evaluated and merged into `attrs`, every `On` listener collected
 *  into `handlers`, and every `List`/`Cond` child fully resolved into
 *  `children`. */
export type MaterializedElement = Readonly<{
  _tag: 'MaterializedElement'
  tag: string
  attrs: Readonly<Record<string, string | boolean>>
  handlers: Readonly<Record<string, (event: Event) => unknown>>
  children: ReadonlyArray<MaterializedNode>
}>

/** A materialized text node: its `Bound` value already force-evaluated. */
export type MaterializedText = Readonly<{
  _tag: 'MaterializedText'
  text: string
}>

/** The plain tree a `Binding` collapses to once every `Bound` is evaluated
 *  against a single `Model` snapshot. */
export type MaterializedNode = MaterializedElement | MaterializedText

// EVALUATION

const resolveBound = <Model, A>(
  model: Model,
  value: A | ((model: Model) => A),
): A =>
  typeof value === 'function' ? (value as (model: Model) => A)(model) : value

const materializeAttrs = <Model, Message>(
  model: Model,
  attrBindings: ReadonlyArray<AttrBinding<Model, Message>>,
): Readonly<{
  attrs: Record<string, string | boolean>
  handlers: Record<string, (event: Event) => unknown>
}> => {
  const attrs: Record<string, string | boolean> = {}
  const handlers: Record<string, (event: Event) => unknown> = {}
  for (const attrBinding of attrBindings) {
    M.value(attrBinding).pipe(
      M.tagsExhaustive({
        Attr: attrValue => {
          attrs[attrValue.name] = resolveBound(model, attrValue.value)
        },
        On: onValue => {
          handlers[onValue.event] = onValue.toMessage
        },
      }),
    )
  }
  return { attrs, handlers }
}

/**
 * Expands a single child `Binding` into the `MaterializedNode`s it
 * contributes to its parent's `children`. `El`/`Text`/`Cond` always
 * contribute exactly one node; `List` contributes one node per item, in
 * `select(model)` order, with no node at all for an empty selection.
 */
const materializeChild = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
): ReadonlyArray<MaterializedNode> =>
  M.value(binding).pipe(
    M.tag('List', listBinding =>
      listBinding.select(model).map(item =>
        materializeNode(
          listBinding.renderItem(() => item),
          model,
        ),
      ),
    ),
    M.orElse(otherBinding => [materializeNode(otherBinding, model)]),
  )

const materializeNode = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
): MaterializedNode =>
  M.value(binding).pipe(
    M.tagsExhaustive({
      El: (elBinding): MaterializedNode => {
        const { attrs, handlers } = materializeAttrs(model, elBinding.attrs)
        return {
          _tag: 'MaterializedElement',
          tag: elBinding.tag,
          attrs,
          handlers,
          children: elBinding.children.flatMap(child =>
            materializeChild(child, model),
          ),
        }
      },
      Text: (textBinding): MaterializedNode => ({
        _tag: 'MaterializedText',
        text: resolveBound(model, textBinding.value),
      }),
      Cond: (condBinding): MaterializedNode =>
        materializeNode(
          condBinding.renderBranch(condBinding.discriminant(model)),
          model,
        ),
      // NOTE: a `List` only has a well-defined position when nested inside
      // an element's `children` - materializeChild expands it there. Passed
      // directly as the root binding it has no single node to collapse to.
      List: (): MaterializedNode => {
        throw new Error(
          "materialize: a List binding must be nested inside an element's children, not passed as the root binding",
        )
      },
    }),
  )

/**
 * Force-evaluates every `Bound` in `binding` against `model`, producing a
 * plain tree: `List` children fully expanded in `select(model)` order,
 * `Cond` resolved to its chosen branch, static and bound attributes merged
 * into one `attrs` record, and `On` handlers collected into `handlers`.
 * Synchronous, pure, and side-effect free - the same inputs always produce
 * a structurally equal output.
 */
export const materialize = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
): MaterializedNode => materializeNode(binding, model)
