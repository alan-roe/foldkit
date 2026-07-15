import { Match as M, Stream } from 'effect'

import type {
  AttrBinding,
  Binding,
  Bound,
  FrameCell,
  Host,
  Sub,
} from './binding.js'

// PUBLISHED SHAPE

/**
 * The record a Submodel's `toView` is called with: every published
 * attribute group re-typed to `Model`/`Message`, and every bare `Bound`
 * leaf value (e.g. Dialog's `isVisible`) re-typed the same way. `Shape` is
 * the structural skeleton (keys and which are groups vs. leaves), captured
 * once at the child's own `toView({...})` call and shared by both the
 * child-typed instantiation `config.view` receives and the parent-typed
 * instantiation the consumer's real `toView` receives.
 */
export type PublishedGroups<
  Model,
  Message,
  Shape extends Readonly<Record<string, unknown>>,
> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural probe only: matching "is this key an AttrBinding array / a bare Bound" needs a wide instantiation, never a stored type.
  readonly [K in keyof Shape]: Shape[K] extends ReadonlyArray<
    AttrBinding<any, any>
  >
    ? ReadonlyArray<AttrBinding<Model, Message>>
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above.
      Shape[K] extends Bound<any, infer A>
      ? Bound<Model, A>
      : Shape[K]
}

/**
 * The non-`toView` entries of a Submodel's `viewInputs`: each value is
 * either static (passed through) or `Bound<Model, T>` - parent-dynamic
 * inputs the ui migration guide calls out (`T -> T | Bound<Parent, T>`).
 */
export type DynamicInputs<
  Model,
  Extra extends Readonly<Record<string, unknown>>,
> = {
  readonly [K in keyof Extra]: Extra[K] | Bound<Model, Extra[K]>
}

// LIFT TABLE

/**
 * Re-types one child-typed `AttrBinding` as parent-typed - the seam's
 * publication counterpart to the deleted `childAttributes` wrapper, as pure
 * data transformation instead of a runtime boundary-mapper fold. The rows
 * here: `On`, `OnDispatch`, `Attr` (bound and static), `Prop` (bound and
 * static), and `Mount`/`Unmount`; the bare-`Bound` published-value row is
 * inlined in {@link liftPublishedValue}.
 */
const liftAttr = (
  select: Bound<unknown, unknown>,
  toMessage: (childMessage: unknown) => unknown,
  attrBinding: AttrBinding<unknown, unknown>,
): AttrBinding<unknown, unknown> =>
  M.value(attrBinding).pipe(
    M.tagsExhaustive({
      On: onBinding => ({
        _tag: 'On' as const,
        event: onBinding.event,
        toMessage: (event: Event) => toMessage(onBinding.toMessage(event)),
      }),
      OnDispatch: onDispatchBinding => ({
        _tag: 'OnDispatch' as const,
        event: onDispatchBinding.event,
        handle: (event: Event, dispatch: (message: unknown) => void) =>
          onDispatchBinding.handle(event, message =>
            dispatch(toMessage(message)),
          ),
      }),
      Attr: attrBindingValue => {
        if (typeof attrBindingValue.value !== 'function') {
          return attrBindingValue
        }
        /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- attrBindingValue.value's `Bound<Child, string | boolean>` shape is confirmed by the `typeof === 'function'` guard above; the AttrBinding union carries no static/bound discriminant tag to narrow `value` on directly. */
        const childBound = attrBindingValue.value as Bound<
          unknown,
          string | boolean
        >
        return {
          _tag: 'Attr' as const,
          name: attrBindingValue.name,
          value: (parentModel: unknown) => childBound(select(parentModel)),
        }
      },
      Prop: propBinding => {
        if (typeof propBinding.value !== 'function') {
          return propBinding
        }
        /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- propBinding.value's `Bound<Child, unknown>` shape is confirmed by the `typeof === 'function'` guard above; function-valued properties are wrapped in thunks by the `Prop` contract, so a bare function is always the bound form. */
        const childBound = propBinding.value as Bound<unknown, unknown>
        return {
          _tag: 'Prop' as const,
          name: propBinding.name,
          value: (parentModel: unknown) => childBound(select(parentModel)),
        }
      },
      Mount: mountBinding => ({
        _tag: 'Mount' as const,
        action: {
          ...mountBinding.action,
          f: (element: Element) =>
            Stream.map(mountBinding.action.f(element), toMessage),
        },
      }),
      Unmount: unmountBinding => ({
        _tag: 'Unmount' as const,
        message: toMessage(unmountBinding.message),
      }),
    }),
  )

/** Lifts one entry of the `published` record the child's `toView` shim
 *  receives: an `AttrBinding` array maps every entry through {@link liftAttr};
 *  a bare function is the fifth lift-table row - a published `Bound<Child,
 *  A>` leaf value, contramapped through `select` exactly like a bound
 *  `Attr.value`; anything else (a static leaf value) passes through
 *  unchanged. */
const liftPublishedValue = (
  select: Bound<unknown, unknown>,
  toMessage: (childMessage: unknown) => unknown,
  value: unknown,
): unknown => {
  if (Array.isArray(value)) {
    return value.map(entry =>
      liftAttr(select, toMessage, entry as AttrBinding<unknown, unknown>),
    )
  }
  if (typeof value === 'function') {
    const childBound = value as Bound<unknown, unknown>
    return (parentModel: unknown): unknown => childBound(select(parentModel))
  }
  return value
}

/**
 * Lifts one non-`toView` `viewInputs` entry: a parent-dynamic
 * `Bound<Parent, T>` becomes a legal child `Bound` that reads through the
 * shared frame cell (`(_child) => g(cell.current.model)`), throwing if read
 * before the owning `Sub` mounts - the construction guarantee (`Sub` fills
 * the cell before the child view's first effect runs) would otherwise be
 * silently violated. A static value passes through unchanged.
 */
const liftViewInput = (cell: FrameCell, value: unknown): unknown => {
  if (typeof value !== 'function') {
    return value
  }
  const parentBound = value as Bound<unknown, unknown>
  return (_childModel: unknown): unknown => {
    if (cell.current === undefined) {
      throw new Error(
        'submodel: a viewInputs Bound was read before its Sub boundary mounted - the frame cell is unfilled, which means the child view read it outside a render effect (violating the guarantee that Sub fills the cell before its child view ever runs one)',
      )
    }
    return parentBound(cell.current.model)
  }
}

// SUBMODEL

/**
 * Embeds a child Submodel: builds the child's `binding` ONCE by invoking
 * `config.view` with a wrapped `viewInputs`, and returns a `Sub` the engine
 * (and {@link materialize}) later mount against `select(model)`.
 *
 * Wrapping, in order:
 * 1. Every non-`toView` `viewInputs` entry is lifted via
 *    {@link liftViewInput} (parent-dynamic `Bound`s become cell-reading
 *    child `Bound`s; static values pass through).
 * 2. `toView` becomes a shim: it receives the child's published groups
 *    (child-typed `AttrBinding` arrays / bare `Bound` leaves), lifts every
 *    entry to parent-typed via {@link liftPublishedValue}, calls the
 *    consumer's real `toView` with the lifted record, and wraps the
 *    resulting `Binding<Parent, ParentMessage>` in a `Host` sharing this
 *    `Sub`'s frame cell.
 *
 * `config.view` runs exactly once, synchronously, inside this call.
 */
export const submodel = <
  Parent,
  ParentMessage,
  Child,
  ChildMessage,
  Shape extends Readonly<Record<string, unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- default "no extra dynamic inputs" shape; components with none never instantiate `Extra`.
  Extra extends Readonly<Record<string, unknown>> = {},
>(
  config: Readonly<{
    select: Bound<Parent, Child>
    toMessage: (childMessage: ChildMessage) => ParentMessage
    view: (
      viewInputs: Readonly<{
        toView: (
          published: PublishedGroups<Child, ChildMessage, Shape>,
        ) => Binding<Child, ChildMessage>
      }> &
        DynamicInputs<Child, Extra>,
    ) => Binding<Child, ChildMessage>
    viewInputs: Readonly<{
      toView: (
        published: PublishedGroups<Parent, ParentMessage, Shape>,
      ) => Binding<Parent, ParentMessage>
    }> &
      DynamicInputs<Parent, Extra>
  }>,
): Binding<Parent, ParentMessage> => {
  const cell: FrameCell = { current: undefined }

  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- erases `Parent`/`ParentMessage`/`Child`/`ChildMessage` to `unknown` at the `Sub`/`Host` union boundary; `submodel`'s generic signature above is the source of type honesty for callers, this body works in the erased domain the union requires (same precedent as `List`'s `Item` erasure, binding.ts:79-80). */
  const select = config.select as unknown as Bound<unknown, unknown>
  const toMessage = (childMessage: unknown): unknown =>
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above. */
    config.toMessage(childMessage as ChildMessage)

  const consumerViewInputs = config.viewInputs as unknown as Readonly<
    Record<string, unknown>
  >
  const consumerToView = consumerViewInputs['toView'] as (
    published: Readonly<Record<string, unknown>>,
  ) => Binding<unknown, unknown>

  const wrappedInputs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(consumerViewInputs)) {
    if (key === 'toView') {
      continue
    }
    wrappedInputs[key] = liftViewInput(cell, value)
  }
  wrappedInputs['toView'] = (
    published: Readonly<Record<string, unknown>>,
  ): Binding<unknown, unknown> => {
    const liftedPublished: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(published)) {
      liftedPublished[key] = liftPublishedValue(select, toMessage, value)
    }
    const island: Host<unknown, unknown> = {
      _tag: 'Host',
      binding: consumerToView(liftedPublished),
      frame: cell,
    }
    return island
  }

  const childView = config.view as unknown as (
    viewInputs: Readonly<Record<string, unknown>>,
  ) => Binding<unknown, unknown>
  const binding = childView(wrappedInputs)

  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- final Sub/Host union-boundary erasure: the object is a faithful `Sub<Parent, ParentMessage>` by construction (select/toMessage close over the real `config.select`/`config.toMessage`), but its parts were built in the erased `unknown` domain above. */
  return {
    _tag: 'Sub',
    select,
    toMessage,
    binding,
    frame: cell,
  } as unknown as Sub<Parent, ParentMessage>
}
