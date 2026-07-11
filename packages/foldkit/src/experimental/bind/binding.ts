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

/** A binding attached to an element: a static/bound attribute or an event
 *  listener. */
export type AttrBinding<Model, Message> =
  | Attr<Model, Message>
  | On<Model, Message>

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
 * A view description: pure data describing how to render `Model`, shared by
 * the live renderer and the {@link materialize} test path.
 */
export type Binding<Model, Message> =
  | El<Model, Message>
  | Text<Model, Message>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Item is an existential, captured per `list()` call site and erased here.
  | List<Model, Message, any>
  | Cond<Model, Message>

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
