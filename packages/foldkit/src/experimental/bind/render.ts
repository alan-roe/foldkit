import { Equal, Option } from 'effect'

import { makeRenderEffect } from '../reactive/effect.js'
import {
  type Owner,
  disposeOwner,
  getCurrentOwner,
  makeOwner,
  onCleanup,
  runWithOwner,
} from '../reactive/owner.js'
import { type Signal, makeSignal } from '../reactive/signal.js'
import type { Attr, Binding, Cond, El, List, On, Text } from './binding.js'

// CONTEXT

type Ctx<Message> = Readonly<{
  document: Document
  dispatch: (message: Message) => void
  onThunkEvaluation: (() => void) | undefined
}>

// ATTRIBUTES

const writeAttr = (
  element: Element,
  name: string,
  value: string | boolean,
): void => {
  if (typeof value !== 'boolean') {
    element.setAttribute(name, value)
    return
  }
  if (value) {
    element.setAttribute(name, '')
    return
  }
  element.removeAttribute(name)
}

const buildAttr = <Model, Message>(
  element: Element,
  attrBinding: Attr<Model, Message>,
  model: Model,
  ctx: Ctx<Message>,
): void => {
  const { name, value } = attrBinding
  if (typeof value !== 'function') {
    writeAttr(element, name, value)
    return
  }
  let hasWritten = false
  let lastWritten: string | boolean = false
  makeRenderEffect(() => {
    ctx.onThunkEvaluation?.()
    const next = value(model)
    if (hasWritten && Equal.equals(lastWritten, next)) {
      return
    }
    hasWritten = true
    lastWritten = next
    writeAttr(element, name, next)
  })
}

const buildListener = <Model, Message>(
  element: Element,
  onBinding: On<Model, Message>,
  ctx: Ctx<Message>,
): void => {
  const listener = (event: Event): void => {
    ctx.dispatch(onBinding.toMessage(event))
  }
  element.addEventListener(onBinding.event, listener)
  onCleanup(() => {
    element.removeEventListener(onBinding.event, listener)
  })
}

// TEXT

const buildText = <Model, Message>(
  textBinding: Text<Model, Message>,
  model: Model,
  ctx: Ctx<Message>,
): globalThis.Text => {
  const { value } = textBinding
  if (typeof value !== 'function') {
    return ctx.document.createTextNode(value)
  }
  const node = ctx.document.createTextNode('')
  let hasWritten = false
  let lastWritten = ''
  makeRenderEffect(() => {
    ctx.onThunkEvaluation?.()
    const next = value(model)
    if (hasWritten && Equal.equals(lastWritten, next)) {
      return
    }
    hasWritten = true
    lastWritten = next
    node.data = next
  })
  return node
}

// ELEMENT

const buildElement = <Model, Message>(
  elBinding: El<Model, Message>,
  model: Model,
  ctx: Ctx<Message>,
): Element => {
  const element = ctx.document.createElement(elBinding.tag)
  for (const attrBinding of elBinding.attrs) {
    if (attrBinding._tag === 'On') {
      buildListener(element, attrBinding, ctx)
      continue
    }
    buildAttr(element, attrBinding, model, ctx)
  }
  buildChildren(element, elBinding.children, model, ctx)
  return element
}

// CHILDREN

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Item is erased on the Binding union, mirroring binding.ts.
type DeferredChild<Model, Message> = Readonly<{
  binding: List<Model, Message, any> | Cond<Model, Message>
  anchor: Comment
}>

/**
 * Walks `children` once, appending (or inserting before `referenceNode`)
 * each child's DOM in order. `El`/`Text` children build directly; `List`/
 * `Cond` children get a `Comment` anchor placed at their slot immediately,
 * with their reactive setup deferred until every sibling in `children` has
 * been appended - only then does `anchor.nextSibling` correctly name the
 * fixed boundary node their own inserts/removes must never cross. Returns
 * the direct top-level nodes this call inserted, in order: the built node
 * for `El`/`Text`, the anchor `Comment` for `List`/`Cond`.
 *
 * NOTE: a `List`/`Cond` child whose own root binding is itself a `List` or
 * `Cond` (rather than `El`/`Text`) is represented here by only its anchor
 * `Comment`; a caller tracking that binding's node set for later move/
 * removal (a list row, a cond branch) would not see nodes it inserts past
 * its own anchor. Out of scope for v0: every `renderItem`/`renderBranch` in
 * the shared TodoMVC fixtures roots in `El`/`Text`.
 */
const buildChildren = <Model, Message>(
  parent: Node & ParentNode,
  children: ReadonlyArray<Binding<Model, Message>>,
  model: Model,
  ctx: Ctx<Message>,
  referenceNode: Node | null = null,
): ReadonlyArray<Node> => {
  const topNodes: Array<Node> = []
  const deferred: Array<DeferredChild<Model, Message>> = []

  for (const child of children) {
    if (child._tag === 'List' || child._tag === 'Cond') {
      const anchor = ctx.document.createComment(child._tag)
      parent.insertBefore(anchor, referenceNode)
      deferred.push({ binding: child, anchor })
      topNodes.push(anchor)
      continue
    }
    const node =
      child._tag === 'El'
        ? buildElement(child, model, ctx)
        : buildText(child, model, ctx)
    parent.insertBefore(node, referenceNode)
    topNodes.push(node)
  }

  for (const { binding, anchor } of deferred) {
    if (binding._tag === 'List') {
      setupList(parent, anchor, binding, model, ctx)
      continue
    }
    setupCond(parent, anchor.nextSibling, binding, model, ctx)
  }

  return topNodes
}

// LIST

type RowState<Item> = Readonly<{
  itemSignal: Signal<Item>
  owner: Owner
  nodes: ReadonlyArray<Node>
}>

/**
 * One render effect reads `select(model)` and keyed-diffs it against the
 * previous run's `rows`: removed keys are disposed (`disposeOwner`) and
 * their DOM removed; every surviving key gets `itemSignal.write(item)`
 * (a no-op when the item reference/value is `Equal.equals` to last time,
 * so an untouched row's own effects never run); a forward walk then moves
 * each row's DOM only when it is not already immediately before the
 * position the walk expects, so an unchanged order performs zero DOM
 * writes and a full reorder moves existing nodes rather than recreating
 * them.
 */
const setupList = <Model, Message, Item>(
  parent: Node & ParentNode,
  anchor: Comment,
  listBinding: List<Model, Message, Item>,
  model: Model,
  ctx: Ctx<Message>,
): void => {
  const rows = new Map<string, RowState<Item>>()
  const listOwner = makeOwner(getCurrentOwner())

  runWithOwner(listOwner, () => {
    makeRenderEffect(() => {
      ctx.onThunkEvaluation?.()
      const items = listBinding.select(model)
      const nextKeys = new Set(items.map(listBinding.toKey))

      for (const [key, row] of rows) {
        if (nextKeys.has(key)) {
          continue
        }
        disposeOwner(row.owner)
        for (const node of row.nodes) {
          parent.removeChild(node)
        }
        rows.delete(key)
      }

      let expectedNext: Node | null = anchor.nextSibling
      for (const item of items) {
        const key = listBinding.toKey(item)
        const existing = rows.get(key)
        if (existing !== undefined) {
          existing.itemSignal.write(item)
          if (existing.nodes[0] !== expectedNext) {
            for (const node of existing.nodes) {
              parent.insertBefore(node, expectedNext)
            }
          }
          const lastExisting = existing.nodes[existing.nodes.length - 1]
          expectedNext =
            lastExisting === undefined ? null : lastExisting.nextSibling
          continue
        }

        const itemSignal = makeSignal<Item>(item)
        const rowOwner = makeOwner(Option.some(listOwner))
        const nodes = runWithOwner(rowOwner, () =>
          buildChildren(
            parent,
            [listBinding.renderItem(itemSignal.read)],
            model,
            ctx,
            expectedNext,
          ),
        )
        rows.set(key, { itemSignal, owner: rowOwner, nodes })
        const lastCreated = nodes[nodes.length - 1]
        expectedNext =
          lastCreated === undefined ? null : lastCreated.nextSibling
      }
    })
  })
}

// COND

/**
 * One render effect reads `discriminant(model)`. The first run (no prior
 * key) and every run whose key differs from the last dispose the current
 * branch owner and DOM, then build `renderBranch(key)` into the same
 * position: immediately before `boundary`, the sibling fixed at the moment
 * this `Cond`'s slot was reached (see {@link buildChildren}), so unrelated
 * siblings never move.
 */
const setupCond = <Model, Message>(
  parent: Node & ParentNode,
  boundary: Node | null,
  condBinding: Cond<Model, Message>,
  model: Model,
  ctx: Ctx<Message>,
): void => {
  const condOwner = makeOwner(getCurrentOwner())
  let branchOwner: Owner | undefined
  let branchNodes: ReadonlyArray<Node> = []
  let lastKey: string | undefined

  runWithOwner(condOwner, () => {
    makeRenderEffect(() => {
      ctx.onThunkEvaluation?.()
      const key = condBinding.discriminant(model)
      if (lastKey !== undefined && key === lastKey) {
        return
      }
      lastKey = key

      if (branchOwner !== undefined) {
        disposeOwner(branchOwner)
        for (const node of branchNodes) {
          parent.removeChild(node)
        }
      }

      const nextBranchOwner = makeOwner(Option.some(condOwner))
      branchOwner = nextBranchOwner
      branchNodes = runWithOwner(nextBranchOwner, () =>
        buildChildren(
          parent,
          [condBinding.renderBranch(key)],
          model,
          ctx,
          boundary,
        ),
      )
    })
  })
}

// MOUNT

/** Options for {@link mount}. `view` is a `ModelStore.view` proxy (or any
 *  object exposing the same tracked-read semantics); `document` is explicit
 *  so tests can pass happy-dom's document rather than a global one.
 *  `onThunkEvaluation`, when present, is called once per `Bound` evaluation
 *  (an attr/text write-effect run, a `List` `select` run, a `Cond`
 *  `discriminant` run) - useful for fitness gates, otherwise a plain
 *  `undefined` check away from zero cost. */
export type MountOptions<Model, Message> = Readonly<{
  binding: Binding<Model, Message>
  view: Model
  dispatch: (message: Message) => void
  container: Element
  document: Document
  onThunkEvaluation?: () => void
}>

/** The handle {@link mount} returns. */
export type Mounted = Readonly<{ dispose: () => void }>

/**
 * Walks `binding` once, building real DOM under `container`: static attrs
 * and text are written at creation with no effect allocated; every bound
 * attr/text gets its own render effect, writing DOM only when its value
 * changes; `List`/`Cond` children get keyed/discriminated reactive regions
 * (see {@link setupList}, {@link setupCond}). Everything mounts under one
 * root `Owner`; `dispose()` tears the whole tree down - every effect
 * unsubscribed, every listener removed, every row/branch owner disposed.
 */
export const mount = <Model, Message>(
  options: MountOptions<Model, Message>,
): Mounted => {
  const ctx: Ctx<Message> = {
    document: options.document,
    dispatch: options.dispatch,
    onThunkEvaluation: options.onThunkEvaluation ?? undefined,
  }
  const rootOwner = makeOwner(Option.none())

  runWithOwner(rootOwner, () => {
    buildChildren(options.container, [options.binding], options.view, ctx)
  })

  return {
    dispose: (): void => {
      disposeOwner(rootOwner)
    },
  }
}
