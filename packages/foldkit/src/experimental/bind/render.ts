import { Equal, Option } from 'effect'

import type { MountAction } from '../../mount/index.js'
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
import type {
  Attr,
  Binding,
  Bound,
  Cond,
  El,
  Host,
  List,
  MountAttr,
  On,
  Sub,
  Text,
  UnmountAttr,
} from './binding.js'

// CONTEXT

/** Runs `action.f(element)`'s Stream to completion, dispatching each
 *  emitted Message; returns an interrupt callback for `onCleanup`. Erased
 *  to `unknown` Message/error so one runner (supplied by the runtime for
 *  the bindView path) serves every `Ctx<Message>` instantiation, including
 *  the `unknown`-typed contexts `Sub`/`Host` recurse into. `undefined`
 *  when no runner was supplied (tests, `materialize`) - Mount attrs are
 *  then inert, matching today's test/Scene parity. */
type RunMountAction = (
  action: MountAction<unknown, unknown>,
  element: Element,
  dispatch: (message: unknown) => void,
) => () => void

type Ctx<Message> = Readonly<{
  document: Document
  dispatch: (message: Message) => void
  onThunkEvaluation: (() => void) | undefined
  runMountAction: RunMountAction | undefined
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

/** Invokes `ctx.runMountAction`, when present, right after element
 *  creation; the returned interrupt is registered with `onCleanup` so
 *  disposal (of this element's owner, or any ancestor's) interrupts the
 *  Mount's fiber. When no runner is supplied - `mount()` without
 *  `runMountAction`, or the `materialize` test path - `Mount` attrs are
 *  inert, matching today's test/Scene parity. */
const buildMount = <Model, Message>(
  element: Element,
  mountBinding: MountAttr<Model, Message>,
  ctx: Ctx<Message>,
): void => {
  const { runMountAction } = ctx
  if (runMountAction === undefined) {
    return
  }
  const interrupt = runMountAction(
    mountBinding.action,
    element,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- runMountAction is erased to `unknown` Message so one runner serves every Ctx<Message> instantiation; the only Messages it ever dispatches are ones `mountBinding.action.f` itself produced, which are Message-typed by construction (List-precedent erasure, binding.ts:79-80).
    ctx.dispatch as (message: unknown) => void,
  )
  onCleanup(interrupt)
}

/** `Unmount` has no live behaviour of its own beyond registering the
 *  dispatch: owner cleanups run in deterministic order before the DOM
 *  range is detached, so this needs no `resolveUnmount`-style snapshot -
 *  `ctx.dispatch` is already immortal, composed data by the time it
 *  reaches here (through any enclosing `Sub`). */
const buildUnmount = <Model, Message>(
  _element: Element,
  unmountBinding: UnmountAttr<Model, Message>,
  ctx: Ctx<Message>,
): void => {
  onCleanup(() => {
    ctx.dispatch(unmountBinding.message)
  })
}

// TEXT

/** Attaches the bound-text render effect to an existing text node - shared
 *  by {@link buildText} (which also creates the node) and the template
 *  path (which clones it instead). */
const bindTextEffect = <Model, Message>(
  node: globalThis.Text,
  value: Bound<Model, string>,
  model: Model,
  ctx: Ctx<Message>,
): void => {
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
}

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
  bindTextEffect(node, value, model, ctx)
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
    if (attrBinding._tag === 'Mount') {
      buildMount(element, attrBinding, ctx)
      continue
    }
    if (attrBinding._tag === 'Unmount') {
      buildUnmount(element, attrBinding, ctx)
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
    if (child._tag === 'Sub') {
      topNodes.push(...buildSub(parent, child, model, ctx, referenceNode))
      continue
    }
    if (child._tag === 'Host') {
      topNodes.push(...buildHost(parent, child, ctx, referenceNode))
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

// SUBMODEL

/**
 * `Sub` is a transparent boundary, not its own DOM node: it fills the
 * shared `frame` with the CURRENT (parent-side) model/dispatch - not the
 * child's - so a `Host` mounted anywhere inside `binding` can read back
 * out to the frame this `Sub` captured, then recurses into `binding` with
 * the child-side model (`select(model)`) and a dispatch composed through
 * `toMessage`. `onCleanup` clears the cell so a `Host` can never observe
 * a stale frame after this `Sub`'s owner disposes.
 */
const buildSub = <Model, Message>(
  parent: Node & ParentNode,
  subBinding: Sub<Model, Message>,
  model: Model,
  ctx: Ctx<Message>,
  referenceNode: Node | null,
): ReadonlyArray<Node> => {
  const { select, toMessage, binding, frame } = subBinding
  frame.current = {
    model,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Frame erases Message to `unknown` at the Sub/Host boundary so one FrameCell shape serves every Sub, mirroring the Binding union's Item erasure (binding.ts:79-80). A Host reading this frame back only ever calls it with Messages this Sub's own `ctx.dispatch` already accepts.
    dispatch: ctx.dispatch as (message: unknown) => void,
  }
  onCleanup(() => {
    frame.current = undefined
  })
  const childModel = select(model)
  const childCtx: Ctx<unknown> = {
    ...ctx,
    dispatch: message => ctx.dispatch(toMessage(message)),
  }
  return buildChildren(parent, [binding], childModel, childCtx, referenceNode)
}

/**
 * `Host` is the other half of the transparent boundary: it re-enters the
 * frame its owning `Sub` captured (same model/dispatch that Sub mounted
 * under) to mount consumer-authored, parent-typed layout from inside the
 * child's own binding tree. Reading `frame.current` before the owning
 * `Sub` has filled it, or after it has cleared on disposal, is a
 * construction-guarantee violation the seam promises never happens for a
 * `Host` produced by `submodel()`'s own wiring - the throw here names
 * that guarantee for the (unsupported) case of a hand-built `Host`.
 */
const buildHost = <Model, Message>(
  parent: Node & ParentNode,
  hostBinding: Host<Model, Message>,
  ctx: Ctx<Message>,
  referenceNode: Node | null,
): ReadonlyArray<Node> => {
  const frame = hostBinding.frame.current
  if (frame === undefined) {
    throw new Error(
      '[foldkit] Host mounted with no frame - a Host can only mount while ' +
        'the Sub that produced it (via submodel()) is on the mount stack. ' +
        'This is a construction guarantee submodel() is responsible for; ' +
        'a hand-built Host outside that wiring is unsupported.',
    )
  }
  const hostCtx: Ctx<unknown> = { ...ctx, dispatch: frame.dispatch }
  return buildChildren(
    parent,
    [hostBinding.binding],
    frame.model,
    hostCtx,
    referenceNode,
  )
}

// TEMPLATE

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- List's Item is erased on the Binding union, mirroring binding.ts.
type TemplateSite =
  | Readonly<{ kind: 'text'; path: ReadonlyArray<number> }>
  | Readonly<{ kind: 'attr'; path: ReadonlyArray<number>; attrIndex: number }>
  | Readonly<{ kind: 'on'; path: ReadonlyArray<number>; attrIndex: number }>
  | Readonly<{ kind: 'mount'; path: ReadonlyArray<number>; attrIndex: number }>
  | Readonly<{
      kind: 'unmount'
      path: ReadonlyArray<number>
      attrIndex: number
    }>
  | Readonly<{ kind: 'list'; path: ReadonlyArray<number> }>
  | Readonly<{ kind: 'cond'; path: ReadonlyArray<number> }>
  | Readonly<{ kind: 'sub'; path: ReadonlyArray<number> }>
  | Readonly<{ kind: 'host'; path: ReadonlyArray<number> }>

type ElementTemplate = Readonly<{
  root: Node
  sites: ReadonlyArray<TemplateSite>
}>

/**
 * Builds a template's static DOM skeleton once from a sample `El`/`Text`
 * binding tree: static tags/attrs/text are written directly, exactly as
 * `buildElement`/`buildText` would, but every bound attr/text/`On`, and
 * every `List`/`Cond` child, records a `TemplateSite` instead of building
 * live behaviour - `path` is the sequence of `children` indices from the
 * root down to that site, which is *also* the sequence of DOM child steps
 * to the corresponding cloned node (one DOM node is built per binding node
 * here), so the same `path` locates both sides at instantiation time.
 */
const buildTemplateNode = <Model, Message>(
  binding: El<Model, Message> | Text<Model, Message>,
  ctx: Ctx<Message>,
  path: ReadonlyArray<number>,
  sites: Array<TemplateSite>,
): Node => {
  if (binding._tag === 'Text') {
    const { value } = binding
    if (typeof value === 'function') {
      sites.push({ kind: 'text', path })
      return ctx.document.createTextNode('')
    }
    return ctx.document.createTextNode(value)
  }

  const element = ctx.document.createElement(binding.tag)
  binding.attrs.forEach((attrBinding, attrIndex) => {
    if (attrBinding._tag === 'On') {
      sites.push({ kind: 'on', path, attrIndex })
      return
    }
    if (attrBinding._tag === 'Mount') {
      sites.push({ kind: 'mount', path, attrIndex })
      return
    }
    if (attrBinding._tag === 'Unmount') {
      sites.push({ kind: 'unmount', path, attrIndex })
      return
    }
    if (typeof attrBinding.value === 'function') {
      sites.push({ kind: 'attr', path, attrIndex })
      return
    }
    writeAttr(element, attrBinding.name, attrBinding.value)
  })

  binding.children.forEach((child, childIndex) => {
    const childPath = [...path, childIndex]
    if (
      child._tag === 'List' ||
      child._tag === 'Cond' ||
      child._tag === 'Sub' ||
      child._tag === 'Host'
    ) {
      const anchor = ctx.document.createComment(child._tag)
      element.appendChild(anchor)
      const kind =
        child._tag === 'List'
          ? 'list'
          : child._tag === 'Cond'
            ? 'cond'
            : child._tag === 'Sub'
              ? 'sub'
              : 'host'
      sites.push({ kind, path: childPath })
      return
    }
    element.appendChild(buildTemplateNode(child, ctx, childPath, sites))
  })

  return element
}

/** Walks `path` from `root` using only `firstChild`/`nextSibling` (never
 *  `childNodes` indexing), the same technique the template was built with,
 *  so a clone's site nodes are found without materializing a live
 *  collection. */
const resolveTemplatePath = (root: Node, path: ReadonlyArray<number>): Node => {
  let node: Node = root
  for (const step of path) {
    let child = node.firstChild as Node
    for (let hop = 0; hop < step; hop += 1) {
      child = child.nextSibling as Node
    }
    node = child
  }
  return node
}

/** Extracts the sub-binding at `path` from a fresh binding tree of the
 *  template's shape - see {@link buildTemplateNode} for why `path` means
 *  the same thing on both sides. */
const resolveBindingAt = <Model, Message>(
  root: El<Model, Message> | Text<Model, Message>,
  path: ReadonlyArray<number>,
): Binding<Model, Message> => {
  let node: Binding<Model, Message> = root
  for (const step of path) {
    node = (node as El<Model, Message>).children[step] as Binding<
      Model,
      Message
    >
  }
  return node
}

/**
 * Clones `template.root` and, at each recorded site, attaches the
 * per-instance behaviour (bound-attr/text render effect, event listener,
 * `List`/`Cond` reactive region) using the closures pulled from
 * `rowBinding` - a freshly built binding tree of the same shape the
 * template was sampled from (its own `itemSignal.read`/`toMessage`
 * closures, never the sample's). Static nodes/attrs/text see no DOM write
 * here: they arrived already correct via `cloneNode(true)`.
 */
const instantiateFromTemplate = <Model, Message>(
  template: ElementTemplate,
  rowBinding: El<Model, Message> | Text<Model, Message>,
  model: Model,
  ctx: Ctx<Message>,
): Node => {
  const root = template.root.cloneNode(true)
  for (const site of template.sites) {
    const target = resolveTemplatePath(root, site.path)
    const binding = resolveBindingAt(rowBinding, site.path)
    switch (site.kind) {
      case 'text': {
        bindTextEffect(
          target as globalThis.Text,
          (binding as Text<Model, Message>).value as Bound<Model, string>,
          model,
          ctx,
        )
        break
      }
      case 'attr': {
        const attrBinding = (binding as El<Model, Message>).attrs[
          site.attrIndex
        ] as Attr<Model, Message>
        buildAttr(target as Element, attrBinding, model, ctx)
        break
      }
      case 'on': {
        const onBinding = (binding as El<Model, Message>).attrs[
          site.attrIndex
        ] as On<Model, Message>
        buildListener(target as Element, onBinding, ctx)
        break
      }
      case 'list': {
        setupList(
          target.parentNode as Node & ParentNode,
          target as Comment,
          binding as List<Model, Message, any>,
          model,
          ctx,
        )
        break
      }
      case 'mount': {
        const mountBinding = (binding as El<Model, Message>).attrs[
          site.attrIndex
        ] as MountAttr<Model, Message>
        buildMount(target as Element, mountBinding, ctx)
        break
      }
      case 'unmount': {
        const unmountBinding = (binding as El<Model, Message>).attrs[
          site.attrIndex
        ] as UnmountAttr<Model, Message>
        buildUnmount(target as Element, unmountBinding, ctx)
        break
      }
      case 'cond': {
        setupCond(
          target.parentNode as Node & ParentNode,
          (target as Comment).nextSibling,
          binding as Cond<Model, Message>,
          model,
          ctx,
        )
        break
      }
      case 'sub': {
        buildSub(
          target.parentNode as Node & ParentNode,
          binding as Sub<Model, Message>,
          model,
          ctx,
          target.nextSibling,
        )
        break
      }
      case 'host': {
        buildHost(
          target.parentNode as Node & ParentNode,
          binding as Host<Model, Message>,
          ctx,
          target.nextSibling,
        )
        break
      }
    }
  }
  return root
}

const rowTemplateCache = new WeakMap<
  List<any, any, any>,
  WeakMap<Document, ElementTemplate>
>()

/**
 * Lazily builds and caches a `List`'s row template, keyed by the stable
 * `List` binding object and `document`. Every row creation calls
 * `renderItem` fresh (its closures are per-row `itemSignal.read`), so the
 * cache cannot key off the row binding itself - `sample` (whichever row
 * triggers the cache miss, always the first) only donates its *shape*,
 * which every row shares since `renderItem` is deterministic.
 */
const getOrBuildRowTemplate = <Model, Message>(
  listBinding: List<Model, Message, any>,
  sample: El<Model, Message> | Text<Model, Message>,
  ctx: Ctx<Message>,
): ElementTemplate => {
  const byDocument = rowTemplateCache.get(listBinding)
  const cached = byDocument?.get(ctx.document)
  if (cached !== undefined) {
    return cached
  }
  const sites: Array<TemplateSite> = []
  const root = buildTemplateNode(sample, ctx, [], sites)
  const template: ElementTemplate = { root, sites }
  const nextByDocument = byDocument ?? new WeakMap<Document, ElementTemplate>()
  nextByDocument.set(ctx.document, template)
  rowTemplateCache.set(listBinding, nextByDocument)
  return template
}

/**
 * Builds one list row's DOM and inserts it before `referenceNode`. A row
 * rooted in `El`/`Text` (every `renderItem` in the shared TodoMVC
 * fixtures) clones the cached template instead of recursing through
 * `createElement`/`setAttribute` per node - static structure costs nothing
 * after the first row. A row rooted in `List`/`Cond` itself has no static
 * skeleton to cache and falls back to {@link buildChildren} (matching its
 * documented out-of-scope-for-v0 case).
 */
const instantiateListRow = <Model, Message, Item>(
  listBinding: List<Model, Message, Item>,
  rowBinding: Binding<Model, Message>,
  parent: Node & ParentNode,
  referenceNode: Node | null,
  model: Model,
  ctx: Ctx<Message>,
): ReadonlyArray<Node> => {
  if (
    rowBinding._tag === 'List' ||
    rowBinding._tag === 'Cond' ||
    rowBinding._tag === 'Sub' ||
    rowBinding._tag === 'Host'
  ) {
    return buildChildren(parent, [rowBinding], model, ctx, referenceNode)
  }
  const template = getOrBuildRowTemplate(listBinding, rowBinding, ctx)
  const node = instantiateFromTemplate(template, rowBinding, model, ctx)
  parent.insertBefore(node, referenceNode)
  return [node]
}

// LIST

type RowState<Item> = Readonly<{
  itemSignal: Signal<Item>
  owner: Owner
  nodes: ReadonlyArray<Node>
}>

/**
 * Removes every node strictly between `start` and `end` (both of which
 * survive), walking backward from `end.previousSibling`. Back-to-front
 * order means each `removeChild` drops the *last* child of whatever
 * remains rather than the first - no subsequent siblings ever need to
 * shift down an index because of it, which is the difference between this
 * and a front-to-back loop under a DOM implementation whose child list is
 * a plain array (as in this project's `happy-dom` test/bench harness;
 * V8/Blink's own child-list representation is not a flat array, so a real
 * browser does not pay that asymmetry - see {@link setupList}'s docstring
 * for the measurements that motivated this). Used for the List clear fast
 * path, where the DOM between the two anchors is dropped as a unit ahead
 * of per-row owner disposal instead of interleaved with it.
 */
const detachRange = (
  parent: Node & ParentNode,
  start: Node,
  end: Node,
): void => {
  let node = end.previousSibling
  while (node !== null && node !== start) {
    const prev = node.previousSibling
    parent.removeChild(node)
    node = prev
  }
}

/**
 * Tears down one row's reactive owner (listener cleanup, signal/effect
 * unlinking - identical either way) and, when `detachDom` is `true`, also
 * removes its DOM nodes one at a time. Pass `false` from a call site that
 * has already bulk-detached the row's nodes (see {@link detachRange}) so
 * disposal never re-removes (and doesn't throw attempting to remove)
 * nodes that are no longer attached.
 */
const disposeRow = <Item>(
  parent: Node & ParentNode,
  row: RowState<Item>,
  detachDom: boolean,
): void => {
  disposeOwner(row.owner)
  if (detachDom) {
    for (const node of row.nodes) {
      parent.removeChild(node)
    }
  }
}

/**
 * One render effect reads `select(model)` and keyed-diffs it against the
 * previous run's `rows`: removed keys are disposed (`disposeOwner`) and
 * their DOM removed; every surviving key gets `itemSignal.write(item)`
 * (a no-op when the item reference/value is `Equal.equals` to last time,
 * so an untouched row's own effects never run); a forward walk then moves
 * each row's DOM only when it is not already immediately before the
 * position the walk expects, so an unchanged order performs zero DOM
 * writes and a full reorder moves existing nodes rather than recreating
 * them. New rows are built via {@link instantiateListRow}, which clones a
 * cached per-`List` template rather than recursing through
 * `createElement`/`setAttribute` for every node.
 *
 * A `List` gets a second `Comment` anchor (`endAnchor`), placed once right
 * after `anchor` before the first effect run, so the row range always has
 * a fixed end boundary independent of what follows the list in `parent`
 * (another sibling, nothing, or - after this List's own first row - the
 * first row itself). The fidelity comparison serializer drops `Comment`
 * nodes, so this costs nothing there.
 *
 * NOTE: an empty next selection skips the keyed diff entirely - no
 * `nextKeys` Set, no per-row lookup - since every row is being torn down
 * regardless of key; this is the 1000 -> 0 "clear" transition. Measured
 * against this project's `happy-dom` bench/test harness with 1000 rows
 * (a `<li>` with a nested `<input>` carrying a listener - see
 * `src/test/apps/renderCompare/viewBound.ts`): a front-to-back
 * `removeChild` loop (the naive approach) ran ~2-4.5ms with occasional
 * spikes past 9ms; the same loop back-to-front (now {@link detachRange})
 * ran a consistent ~1.6-2.5ms; `parent.replaceChildren(anchor, endAnchor)`
 * (only usable when the list is `parent`'s sole content) was
 * statistically indistinguishable from the back-to-front loop
 * (~1.5-2.2ms) - not worth a second code path for. A `Range` spanning the
 * two anchors with `deleteContents()` was tried and abandoned: happy-dom's
 * implementation walks the tree with `Node.following()` under the hood
 * rather than using a flat splice, and at 1000 rows that walk alone blew
 * well past a 30s budget - two to three orders of magnitude slower than
 * any `removeChild`-based approach here. `detachRange` is the winner: one
 * code path, no sole-content branch, and it is the DOM manipulation a
 * `Range` would have to reimplement anyway if it worked.
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
  const endAnchor = ctx.document.createComment('/List')
  parent.insertBefore(endAnchor, anchor.nextSibling)

  runWithOwner(listOwner, () => {
    makeRenderEffect(() => {
      ctx.onThunkEvaluation?.()
      const items = listBinding.select(model)

      if (items.length === 0) {
        if (rows.size > 0) {
          detachRange(parent, anchor, endAnchor)
          for (const row of rows.values()) {
            disposeRow(parent, row, false)
          }
          rows.clear()
        }
        return
      }

      const nextKeys = new Set(items.map(listBinding.toKey))

      for (const [key, row] of rows) {
        if (nextKeys.has(key)) {
          continue
        }
        disposeRow(parent, row, true)
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
        const rowBinding = listBinding.renderItem(itemSignal.read)
        const nodes = runWithOwner(rowOwner, () =>
          instantiateListRow(
            listBinding,
            rowBinding,
            parent,
            expectedNext,
            model,
            ctx,
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
  runMountAction?: RunMountAction
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
    runMountAction: options.runMountAction ?? undefined,
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
