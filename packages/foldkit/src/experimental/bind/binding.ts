import type { MountAction } from '../../mount/index.js'

// FRAME

/** The mount-time frame a `Sub` boundary shares with its `Host` islands and
 *  lifted `viewInputs`: filled by the engine (and by {@link materialize})
 *  when the `Sub` mounts, cleared on owner disposal.
 *
 *  NOTE: one binding-tree instance mounts at most once concurrently - a
 *  `Sub` mount overwrites the cell, disposal clears it. Store tracking
 *  works regardless: it is proxy-based, not frame-based, so a thunk
 *  reading `cell.current.model.someField` inside a render effect tracks
 *  through the parent store's per-path signals no matter which frame the
 *  effect was created under. */
export type Frame = Readonly<{
  model: unknown
  dispatch: (message: unknown) => void
}>

/** A mutable box holding the current {@link Frame} for one `Sub` boundary,
 *  shared by reference between the `Sub` and every `Host`/lifted `Bound`
 *  it produced. */
export type FrameCell = { current: Frame | undefined }

// BOUND

/**
 * A pure, synchronous read of `Model` at a dynamic view position. Must never
 * perform side effects; {@link materialize} and the live renderer both call
 * it as a plain function.
 */
export type Bound<Model, A> = (model: Model) => A

// ATTRIBUTE BINDING

/** A single HTML attribute, either a static literal or bound to `Model`. */
export type Attr<Model, _Message> = Readonly<{
  _tag: 'Attr'
  name: string
  value: string | boolean | Bound<Model, string | boolean>
}>

/**
 * A DOM event listener. `toMessage` must close over stable data only, never
 * `Model` values - Messages are facts captured at dispatch time.
 */
export type On<_Model, Message> = Readonly<{
  _tag: 'On'
  event: string
  toMessage: (event: Event) => Message
}>

/**
 * A DOM event listener whose dispatch is conditional, asynchronous, or
 * both. `handle` receives the raw event and the composed `dispatch`
 * function, and decides for itself whether/when/how many times to call
 * it - unlike {@link On}, which always dispatches exactly one Message per
 * event, synchronously. Reserved for the og event members whose semantics
 * cannot be expressed as "always return a Message": `Option`-returning
 * handlers (dispatch only on `Some`), `instanceof`-guarded custom events,
 * and drag-zone-tracked enter/leave. Not part of the public factory
 * surface - `events.ts` closes over it internally.
 */
export type OnDispatch<_Model, Message> = Readonly<{
  _tag: 'OnDispatch'
  event: string
  handle: (event: Event, dispatch: (message: Message) => void) => void
}>

/** An attribute-position binding that starts an Effect fiber when the
 *  element mounts, dispatching each Message the action's Stream emits.
 *  Interrupted on unmount. `MountAction`'s exact shape lives in
 *  `../../mount/index.js`; imported type-only to avoid a runtime import
 *  from `html/`. */
export type MountAttr<_Model, Message> = Readonly<{
  _tag: 'Mount'
  action: MountAction<Message, unknown>
}>

/** An attribute-position binding that dispatches `message` when the
 *  element unmounts, registered as an owner-ordered cleanup - no snapshot
 *  or registry lookup, since the composed dispatch closure is immortal
 *  data. */
export type UnmountAttr<_Model, Message> = Readonly<{
  _tag: 'Unmount'
  message: Message
}>

/**
 * An arbitrary DOM property write, either a static literal or bound to
 * `Model` - the escape hatch for property-only state (`element.scrollTop`,
 * `element.innerHTML`) that has no HTML attribute equivalent. Applied via
 * plain assignment (`element[name] = value`), never `setAttribute`.
 */
export type Prop<Model, _Message> = Readonly<{
  _tag: 'Prop'
  name: string
  value: unknown | Bound<Model, unknown>
}>

/** A binding attached to an element: a static/bound attribute or DOM
 *  property write, an event listener, or a mount/unmount lifecycle hook. */
export type AttrBinding<Model, Message> =
  | Attr<Model, Message>
  | On<Model, Message>
  | MountAttr<Model, Message>
  | UnmountAttr<Model, Message>
  | OnDispatch<Model, Message>
  | Prop<Model, Message>

// BINDING

/** A tagged element with static/bound attributes and child bindings. */
export type El<Model, Message> = Readonly<{
  _tag: 'El'
  tag: string
  attrs: ReadonlyArray<AttrBinding<Model, Message>>
  children: ReadonlyArray<Binding<Model, Message>>
}>

/** A text node, either a static literal or bound to `Model`. */
export type Text<Model, _Message> = Readonly<{
  _tag: 'Text'
  value: string | Bound<Model, string>
}>

/**
 * A keyed list rendered from `select(model)`. `renderItem` receives a thunk
 * rather than the item itself, so a live renderer can rebind rows to a
 * per-item signal without re-walking the binding tree. `Item` is captured at
 * the {@link list} call site and erased on the `Binding` union.
 */
export type List<Model, Message, Item = unknown> = Readonly<{
  _tag: 'List'
  select: Bound<Model, ReadonlyArray<Item>>
  toKey: (item: Item) => string
  renderItem: (readItem: () => Item) => Binding<Model, Message>
}>

/** A branch chosen by `discriminant(model)`, keyed by the resulting
 *  string. */
export type Cond<Model, Message> = Readonly<{
  _tag: 'Cond'
  discriminant: Bound<Model, string>
  renderBranch: (key: string) => Binding<Model, Message>
}>

/**
 * A child Submodel boundary: `select` derives the child's store view from
 * `Model`, `toMessage` composes a child Message into `Message`, and
 * `binding` is the child's own tree - built ONCE by {@link submodel}
 * invoking the child view. `Child`/`ChildMessage` are erased on the union
 * (same precedent as `List`'s `Item`); `frame` is the mount-time cell this
 * `Sub` shares with every `Host` island its `viewInputs` wrapping produced.
 */
export type Sub<Model, Message> = Readonly<{
  _tag: 'Sub'
  select: Bound<Model, unknown>
  toMessage: (childMessage: unknown) => Message
  binding: Binding<unknown, unknown>
  frame: FrameCell
}>

/**
 * An outer-frame island produced only by {@link submodel}'s `viewInputs`
 * wrapping - never constructed directly. Re-enters the parent frame for
 * consumer-authored layout composed around a `Sub`'s published groups;
 * `Model`/`Message` are phantom (this node's real content is parent-typed,
 * read back out through `frame` at mount/materialize time, the same
 * erasure-with-construction-guarantee precedent as `List`'s `Item`).
 */
export type Host<_Model, _Message> = Readonly<{
  _tag: 'Host'
  binding: Binding<unknown, unknown>
  frame: FrameCell
}>

/**
 * A view description: pure data describing how to render `Model`, shared by
 * the live renderer and the {@link materialize} test path.
 */
export type Binding<Model, Message> =
  | El<Model, Message>
  | Text<Model, Message>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Item is an existential, captured per `list()` call site and erased here.
  | List<Model, Message, any>
  | Cond<Model, Message>
  | Sub<Model, Message>
  | Host<Model, Message>

// CONSTRUCTORS

/** Constructs a tagged element binding. */
export const el = <Model, Message>(
  tag: string,
  attrs: ReadonlyArray<AttrBinding<Model, Message>>,
  children: ReadonlyArray<Binding<Model, Message>>,
): Binding<Model, Message> => ({ _tag: 'El', tag, attrs, children })

/** Constructs a text binding. */
export const text = <Model, Message>(
  value: string | Bound<Model, string>,
): Binding<Model, Message> => ({ _tag: 'Text', value })

/** Constructs a static or bound attribute. */
export const attr = <Model, Message>(
  name: string,
  value: string | boolean | Bound<Model, string | boolean>,
): AttrBinding<Model, Message> => ({ _tag: 'Attr', name, value })

/** Constructs an event listener. */
export const on = <Model, Message>(
  event: string,
  toMessage: (event: Event) => Message,
): AttrBinding<Model, Message> => ({ _tag: 'On', event, toMessage })

/** Constructs a conditional/asynchronous event listener - see
 *  {@link OnDispatch}. Internal: not exported from the public factory
 *  surface, only closed over by `events.ts`'s conditional-dispatch
 *  members. */
export const onDispatch = <Model, Message>(
  event: string,
  handle: (event: Event, dispatch: (message: Message) => void) => void,
): AttrBinding<Model, Message> => ({ _tag: 'OnDispatch', event, handle })

/** Constructs a static or bound DOM property write - see {@link Prop}.
 *  Internal: not exported from the public factory surface; only
 *  `attributes.ts`'s `Prop`/`InnerHTML` members close over it. */
export const prop = <Model, Message>(
  name: string,
  value: unknown | Bound<Model, unknown>,
): AttrBinding<Model, Message> => ({ _tag: 'Prop', name, value })

/** Constructs a keyed list binding. `Item` is inferred from `select`. */
export const list = <Model, Message, Item>(
  select: Bound<Model, ReadonlyArray<Item>>,
  toKey: (item: Item) => string,
  renderItem: (readItem: () => Item) => Binding<Model, Message>,
): Binding<Model, Message> => ({ _tag: 'List', select, toKey, renderItem })

/** Constructs a discriminated-branch binding. */
export const cond = <Model, Message>(
  discriminant: Bound<Model, string>,
  renderBranch: (key: string) => Binding<Model, Message>,
): Binding<Model, Message> => ({ _tag: 'Cond', discriminant, renderBranch })

/** Constructs a mount hook: starts `action`'s Effect fiber when the element
 *  mounts, dispatching each Message its Stream emits; interrupted on
 *  unmount. */
export const onMount = <Model, Message>(
  action: MountAction<Message, unknown>,
): AttrBinding<Model, Message> => ({ _tag: 'Mount', action })

/** Constructs an unmount hook: dispatches `message` when the element is
 *  removed from the DOM. */
export const onUnmount = <Model, Message>(
  message: Message,
): AttrBinding<Model, Message> => ({ _tag: 'Unmount', message })
