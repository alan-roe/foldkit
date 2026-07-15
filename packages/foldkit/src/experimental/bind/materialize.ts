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
  /** The row's `toKey(item)` result, present only on a `List` row's
   *  materialized root when produced via {@link materializeKeyed}. Absent
   *  from plain {@link materialize} output and from non-row nodes. */
  key?: string
  /** Every `MountAttr` collected on this element, as inert display data -
   *  materialize never starts a Mount action's Effect fiber. Absent when
   *  the element carries no `onMount` bindings. `args` mirrors
   *  `MountAction.args`/the snabbdom path's `FoldkitMountMarker.args`
   *  (`Record<string, unknown>`, not an array) for Scene matcher parity. */
  mounts?: ReadonlyArray<
    Readonly<{ name: string; args?: Readonly<Record<string, unknown>> }>
  >
  /** Every `UnmountAttr` collected on this element, `message` composed
   *  through the same `Sub.toMessage` wrap chain a collected `On` handler
   *  sees - so a matcher reading this field observes the parent-typed
   *  Message exactly as unmount dispatch would produce it live. Absent
   *  when the element carries no `onUnmount` bindings. */
  unmounts?: ReadonlyArray<Readonly<{ message: unknown }>>
}>

/** A materialized text node: its `Bound` value already force-evaluated. */
export type MaterializedText = Readonly<{
  _tag: 'MaterializedText'
  text: string
  /** See {@link MaterializedElement.key}. */
  key?: string
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

/** Identity wrap: in force at the materialization root, before any `Sub`
 *  boundary has composed a `toMessage` onto the handler/unmount message
 *  chain. */
const identity = (message: unknown): unknown => message

const materializeAttrs = <Model, Message>(
  model: Model,
  attrBindings: ReadonlyArray<AttrBinding<Model, Message>>,
  wrap: (message: unknown) => unknown,
): Readonly<{
  attrs: Record<string, string | boolean>
  handlers: Record<string, (event: Event) => unknown>
  mounts: ReadonlyArray<
    Readonly<{ name: string; args?: Readonly<Record<string, unknown>> }>
  >
  unmounts: ReadonlyArray<Readonly<{ message: unknown }>>
}> => {
  const attrs: Record<string, string | boolean> = {}
  const handlers: Record<string, (event: Event) => unknown> = {}
  const mounts: Array<
    Readonly<{ name: string; args?: Readonly<Record<string, unknown>> }>
  > = []
  const unmounts: Array<Readonly<{ message: unknown }>> = []
  for (const attrBinding of attrBindings) {
    M.value(attrBinding).pipe(
      M.tagsExhaustive({
        Attr: attrValue => {
          attrs[attrValue.name] = resolveBound(model, attrValue.value)
        },
        On: onValue => {
          handlers[onValue.event] = (event: Event) =>
            wrap(onValue.toMessage(event))
        },
        Mount: mountValue => {
          mounts.push(
            mountValue.action.args === undefined
              ? { name: mountValue.action.name }
              : { name: mountValue.action.name, args: mountValue.action.args },
          )
        },
        Unmount: unmountValue => {
          unmounts.push({ message: wrap(unmountValue.message) })
        },
      }),
    )
  }
  return { attrs, handlers, mounts, unmounts }
}

/**
 * Expands a single child `Binding` into the `MaterializedNode`s it
 * contributes to its parent's `children`. `El`/`Text`/`Cond`/`Sub`/`Host`
 * always contribute exactly one node; `List` contributes one node per item,
 * in `select(model)` order, with no node at all for an empty selection.
 */
const materializeChild = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
  attachKeys: boolean,
  wrap: (message: unknown) => unknown,
  outerWrap: (message: unknown) => unknown,
): ReadonlyArray<MaterializedNode> =>
  M.value(binding).pipe(
    M.tag('List', listBinding =>
      listBinding.select(model).map(item => {
        const node = materializeNode(
          listBinding.renderItem(() => item),
          model,
          attachKeys,
          wrap,
          outerWrap,
        )
        return attachKeys ? { ...node, key: listBinding.toKey(item) } : node
      }),
    ),
    M.orElse(otherBinding => [
      materializeNode(otherBinding, model, attachKeys, wrap, outerWrap),
    ]),
  )

/**
 * Force-evaluates one `Binding` node against `model`. `wrap` is the
 * message-composition chain collected `On`/`Unmount` values at THIS level
 * are threaded through - identity at the materialization root, and
 * `(m) => wrap(sub.toMessage(m))` one level inside every `Sub` crossed so
 * far, so invoking any handler this pass collects yields a fully
 * root-typed Message with no separate fold step. `outerWrap` is `wrap` as
 * it stood immediately BEFORE the innermost `Sub` was entered - the level
 * a `Host` island (sharing that `Sub`'s frame) pops back to.
 */
const materializeNode = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
  attachKeys: boolean,
  wrap: (message: unknown) => unknown,
  outerWrap: (message: unknown) => unknown,
): MaterializedNode =>
  M.value(binding).pipe(
    M.tagsExhaustive({
      El: (elBinding): MaterializedNode => {
        const { attrs, handlers, mounts, unmounts } = materializeAttrs(
          model,
          elBinding.attrs,
          wrap,
        )
        return {
          _tag: 'MaterializedElement',
          tag: elBinding.tag,
          attrs,
          handlers,
          children: elBinding.children.flatMap(child =>
            materializeChild(child, model, attachKeys, wrap, outerWrap),
          ),
          ...(mounts.length > 0 ? { mounts } : {}),
          ...(unmounts.length > 0 ? { unmounts } : {}),
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
          attachKeys,
          wrap,
          outerWrap,
        ),
      // NOTE: a `List` only has a well-defined position when nested inside
      // an element's `children` - materializeChild expands it there. Passed
      // directly as the root binding it has no single node to collapse to.
      List: (): MaterializedNode => {
        throw new Error(
          "materialize: a List binding must be nested inside an element's children, not passed as the root binding",
        )
      },
      Sub: (subBinding): MaterializedNode => {
        subBinding.frame.current = {
          model,
          dispatch: (): void => {
            throw new Error(
              'materialize: Sub dispatch is inert - materialize has no live store to dispatch against, this is a test-only path',
            )
          },
        }
        const childModel = subBinding.select(model)
        const composedWrap = (childMessage: unknown): unknown =>
          wrap(subBinding.toMessage(childMessage))
        return materializeNode(
          subBinding.binding,
          childModel,
          attachKeys,
          composedWrap,
          wrap,
        )
      },
      Host: (hostBinding): MaterializedNode => {
        if (hostBinding.frame.current === undefined) {
          throw new Error(
            "materialize: a Host island materialized before its owning Sub filled the frame cell - a Sub mounts (and fills its cell) strictly before its Host's binding is ever walked, so this means the Host escaped its Sub's subtree",
          )
        }
        return materializeNode(
          hostBinding.binding,
          hostBinding.frame.current.model,
          attachKeys,
          outerWrap,
          outerWrap,
        )
      },
    }),
  )

/**
 * Force-evaluates every `Bound` in `binding` against `model`, producing a
 * plain tree: `List` children fully expanded in `select(model)` order,
 * `Cond` resolved to its chosen branch, static and bound attributes merged
 * into one `attrs` record, `On` handlers collected into `handlers`, `Sub`
 * boundaries crossed with their `toMessage` pre-composed into every handler
 * collected beneath them, and `Host` islands materialized back against the
 * parent frame their owning `Sub` filled. Synchronous, pure, and
 * side-effect free - the same inputs always produce a structurally equal
 * output.
 */
export const materialize = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
): MaterializedNode =>
  materializeNode(binding, model, false, identity, identity)

/**
 * Like {@link materialize}, but also stamps each `List` row's materialized
 * root with its `toKey(item)` result on a `key` field, so a consumer that
 * needs keyed-list identity (Scene's bindView adapter) can carry it through
 * to whatever shape it adapts the tree into. Non-row nodes never get a
 * `key`. Pure, like `materialize`; not used by the live renderer.
 */
export const materializeKeyed = <Model, Message>(
  binding: Binding<Model, Message>,
  model: Model,
): MaterializedNode => materializeNode(binding, model, true, identity, identity)
