import { Option } from 'effect'

import {
  checkScheduledLeave,
  clearDragZoneAfterDrop,
  getDragZoneState,
  processDragEnter,
  processDragLeave,
} from '../../html/dragZoneTracking.js'
import type { MountAction } from '../../mount/index.js'
import type { AttrBinding } from '../bind/binding.js'
import { on, onDispatch, onMount, onUnmount } from '../bind/binding.js'

// MESSAGE-OR-THUNK

/**
 * The value a message-style event member accepts: a static Message, or a
 * thunk evaluated at dispatch time. The thunk form is the sanctioned way to
 * build a payload from a mutable row field (`readItem().field`) inside a
 * `list` row, where the closure must stay stable across re-renders but the
 * data it reads changes. Discriminated at runtime by `typeof === 'function'`
 * - a Message is a tagged record, never callable.
 */
type MessageOrThunk<Message> = Message | (() => Message)

const isThunk = <Message>(
  value: MessageOrThunk<Message>,
): value is () => Message => typeof value === 'function'

const resolveMessage = <Message>(value: MessageOrThunk<Message>): Message =>
  isThunk(value) ? value() : value

/** A message-style event member's call shape: og's plain Message signature,
 *  plus the thunk overload every message-style member gains. */
interface MessageEventMember<Model, Message> {
  (message: Message): AttrBinding<Model, Message>
  (toMessage: () => Message): AttrBinding<Model, Message>
}

/** `OnClickFocus`'s call shape: og's two-argument signature, with the
 *  thunk overload on the trailing Message. */
interface FocusMessageEventMember<Model, Message> {
  (focusSelector: string, message: Message): AttrBinding<Model, Message>
  (focusSelector: string, toMessage: () => Message): AttrBinding<Model, Message>
}

/** `OnCutText`'s call shape: og's two-argument signature, with the thunk
 *  overload on the trailing Message. */
interface CutTextEventMember<Model, Message> {
  (text: string, message: Message): AttrBinding<Model, Message>
  (text: string, toMessage: () => Message): AttrBinding<Model, Message>
}

/** Builds a `MessageEventMember` that always dispatches, mirroring og
 *  interpreters with no conditional logic (a plain `addEventListener` that
 *  unconditionally calls `ctx.dispatch(message)`). */
const messageEvent = <Model, Message>(
  domEvent: string,
): MessageEventMember<Model, Message> => {
  const handler = (
    value: MessageOrThunk<Message>,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>(domEvent, () => resolveMessage(value))
  return handler
}

/** Builds a `MessageEventMember` that runs a synchronous side effect on the
 *  raw event (`preventDefault`, drag-zone cleanup, ...) before always
 *  dispatching, mirroring og interpreters whose effect never gates the
 *  dispatch itself. */
const messageEventWithEffect = <Model, Message>(
  domEvent: string,
  effect: (event: Event) => void,
): MessageEventMember<Model, Message> => {
  const handler = (
    value: MessageOrThunk<Message>,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>(domEvent, event => {
      effect(event)
      return resolveMessage(value)
    })
  return handler
}

/** Builds a `MessageEventMember` whose dispatch is conditional, closing
 *  over `onDispatch` instead of `on`. `decide` receives the raw event and
 *  a thunk resolving the Message (already collapsed from `MessageOrThunk`)
 *  and calls `dispatch` itself, zero or more times, synchronously or not -
 *  see `onDispatch`'s TSDoc in `bind/binding.ts`. */
const conditionalMessageEvent = <Model, Message>(
  domEvent: string,
  decide: (
    event: Event,
    dispatch: (message: Message) => void,
    resolveValue: () => Message,
  ) => void,
): MessageEventMember<Model, Message> => {
  const handler = (
    value: MessageOrThunk<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>(domEvent, (event, dispatch) =>
      decide(event, dispatch, () => resolveMessage(value)),
    )
  return handler
}

/** Builds `OnClickFocus`: focuses the element matching `focusSelector`
 *  (from the click event's own `target.ownerDocument`) then always
 *  dispatches. */
const onClickFocusMember = <Model, Message>(): FocusMessageEventMember<
  Model,
  Message
> => {
  const handler = (
    focusSelector: string,
    value: MessageOrThunk<Message>,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>('click', event => {
      const target = event.target
      if (target instanceof Element) {
        const focusTarget = target.ownerDocument.querySelector(focusSelector)
        if (focusTarget instanceof HTMLElement) {
          focusTarget.focus()
        }
      }
      return resolveMessage(value)
    })
  return handler
}

/** Builds `OnCutText`: writes `text` to the clipboard and dispatches, only
 *  when the browser exposes `clipboardData` on the cut event. */
const onCutTextMember = <Model, Message>(): CutTextEventMember<
  Model,
  Message
> => {
  const handler = (
    text: string,
    value: MessageOrThunk<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('cut', (event, dispatch) => {
      const clipboardEvent = asClipboardEvent(event)
      if (clipboardEvent.clipboardData) {
        clipboardEvent.clipboardData.setData('text/plain', text)
        clipboardEvent.preventDefault()
        dispatch(resolveMessage(value))
      }
    })
  return handler
}

// EVENT NARROWING

/**
 * `on`/`onDispatch` handlers always receive the generic `Event` the IR
 * declares - unlike og, whose per-key `snabbdom` listener record narrows
 * each handler to its concrete DOM event type directly in the callback
 * signature. Every call site below registers a narrowing cast only on the
 * DOM event name that guarantees the concrete subtype, exactly mirroring
 * og's own `event as KeyboardEvent`/`event.target as HTMLInputElement`
 * casts (`html/index.ts` ~1389-1750).
 */
const asPointerEvent = (event: Event): PointerEvent =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above. */
  event as PointerEvent

const asKeyboardEvent = (event: Event): KeyboardEvent =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above. */
  event as KeyboardEvent

const asFocusEvent = (event: Event): FocusEvent =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above. */
  event as FocusEvent

const asClipboardEvent = (event: Event): ClipboardEvent =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above. */
  event as ClipboardEvent

const asDragEvent = (event: Event): DragEvent =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above. */
  event as DragEvent

const inputTarget = (event: Event): HTMLInputElement =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above; narrows `event.target`. */
  event.target as HTMLInputElement

const elementTarget = (event: Event): HTMLElement =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above; narrows `event.target`. */
  event.target as HTMLElement

const detailsTarget = (event: Event): HTMLDetailsElement =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see EVENT NARROWING above; narrows `event.target`. */
  event.target as HTMLDetailsElement

// KEYBOARD MODIFIERS

/** Modifier key state extracted from a `KeyboardEvent`. */
export type KeyboardModifiers = Readonly<{
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}>

const keyboardModifiers = (event: KeyboardEvent): KeyboardModifiers => ({
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
})

// DEVTOOLS

/** Element id the foldkit-devtools panel stamps on its own focusable host,
 *  so `OnBlur` can ignore a blur caused by the panel stealing focus rather
 *  than the user leaving the element. Mirrors og's `DEVTOOLS_HOST_ID`. */
const DEVTOOLS_HOST_ID = 'foldkit-devtools'

// FILE EXTRACTION

const filesOf = (fileList: FileList | null): ReadonlyArray<File> =>
  fileList ? Array.from(fileList) : []

// FACTORY

/**
 * Every `On*` event member of og's `Attribute` enum, plus `AllowDrop` (a
 * `dragover`-only listener with no Message of its own, ported here because
 * it shares this file's conditional-dispatch primitive). `OnCustomEvent` is
 * excluded: og never exposes it through the `h.*` factory surface (it is a
 * standalone `Data.taggedEnum` constructor `customElement/index.ts` calls
 * directly, not `htmlAttributes`/`HtmlAttributes<Message>`), so porting it
 * would add an API og's factory never had.
 *
 * Message-style members (`OnClick`, `OnSubmit`, ...) keep og's signature
 * exactly and gain a thunk overload, resolved at dispatch time. Handler-
 * style members (`OnInput`, `OnKeyDown`, ...) port og's signature as-is.
 * A subset of both families - every og interpreter whose dispatch is
 * conditional, asynchronous, or absent entirely (`OnPointerLeave`'s
 * `Option`-returning `f`, `OnCopyText`'s clipboard-only side effect,
 * `OnDragLeave`'s microtask-deferred dispatch, ...) - closes over the IR's
 * `onDispatch` primitive instead of `on`, since `on`'s `toMessage` always
 * dispatches exactly one Message, synchronously; `onDispatch`'s `handle`
 * decides for itself whether/when to call `dispatch`.
 */
export const eventMembers = <Model, Message>() => ({
  // MOUSE

  OnClick: messageEvent<Model, Message>('click'),
  /**
   * Click handler that synchronously focuses the element matching
   * `focusSelector` (searched from the click event's own
   * `target.ownerDocument`, never a module-level `document` singleton),
   * then dispatches `message`. Both run inside the originating click event
   * handler, preserving the user-gesture context - the same iOS Safari
   * keyboard-opening motivation as og's `OnClickFocus`.
   */
  OnClickFocus: onClickFocusMember<Model, Message>(),
  OnDoubleClick: messageEvent<Model, Message>('dblclick'),
  OnMouseDown: messageEvent<Model, Message>('mousedown'),
  OnMouseUp: messageEvent<Model, Message>('mouseup'),
  OnMouseEnter: messageEvent<Model, Message>('mouseenter'),
  OnMouseLeave: messageEvent<Model, Message>('mouseleave'),
  OnMouseOver: messageEvent<Model, Message>('mouseover'),
  OnMouseOut: messageEvent<Model, Message>('mouseout'),
  OnMouseMove: messageEvent<Model, Message>('mousemove'),

  // POINTER

  OnPointerMove: (
    f: (
      screenX: number,
      screenY: number,
      pointerType: string,
    ) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('pointermove', (event, dispatch) => {
      const pointerEvent = asPointerEvent(event)
      const maybeMessage = f(
        pointerEvent.screenX,
        pointerEvent.screenY,
        pointerEvent.pointerType,
      )
      if (Option.isSome(maybeMessage)) {
        dispatch(maybeMessage.value)
      }
    }),
  OnPointerLeave: (
    f: (pointerType: string) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('pointerleave', (event, dispatch) => {
      const maybeMessage = f(asPointerEvent(event).pointerType)
      if (Option.isSome(maybeMessage)) {
        dispatch(maybeMessage.value)
      }
    }),
  OnPointerDown: (
    f: (
      pointerType: string,
      button: number,
      screenX: number,
      screenY: number,
      timeStamp: number,
      clientX: number,
      clientY: number,
    ) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('pointerdown', (event, dispatch) => {
      const pointerEvent = asPointerEvent(event)
      const maybeMessage = f(
        pointerEvent.pointerType,
        pointerEvent.button,
        pointerEvent.screenX,
        pointerEvent.screenY,
        pointerEvent.timeStamp,
        pointerEvent.clientX,
        pointerEvent.clientY,
      )
      if (Option.isSome(maybeMessage)) {
        dispatch(maybeMessage.value)
      }
    }),
  OnPointerUp: (
    f: (
      screenX: number,
      screenY: number,
      pointerType: string,
      timeStamp: number,
    ) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('pointerup', (event, dispatch) => {
      const pointerEvent = asPointerEvent(event)
      const maybeMessage = f(
        pointerEvent.screenX,
        pointerEvent.screenY,
        pointerEvent.pointerType,
        pointerEvent.timeStamp,
      )
      if (Option.isSome(maybeMessage)) {
        dispatch(maybeMessage.value)
      }
    }),

  // KEYBOARD

  OnKeyDown: (
    f: (key: string, modifiers: KeyboardModifiers) => Message,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>('keydown', event => {
      const keyboardEvent = asKeyboardEvent(event)
      return f(keyboardEvent.key, keyboardModifiers(keyboardEvent))
    }),
  OnKeyDownPreventDefault: (
    f: (key: string, modifiers: KeyboardModifiers) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('keydown', (event, dispatch) => {
      const keyboardEvent = asKeyboardEvent(event)
      const maybeMessage = f(
        keyboardEvent.key,
        keyboardModifiers(keyboardEvent),
      )
      if (Option.isSome(maybeMessage)) {
        keyboardEvent.preventDefault()
        dispatch(maybeMessage.value)
      }
    }),
  /**
   * Keydown handler that, for a handled key, synchronously focuses the
   * element matching `focusSelector` (searched from the keydown event's own
   * `target.ownerDocument`) and dispatches `message`, both inside the
   * originating event handler. Returns `Option.none()` for keys it does not
   * handle, leaving default behavior intact; a `Some` result also
   * `preventDefault`s.
   */
  OnKeyDownFocus: (
    f: (
      key: string,
      modifiers: KeyboardModifiers,
    ) => Option.Option<Readonly<{ focusSelector: string; message: Message }>>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('keydown', (event, dispatch) => {
      const keyboardEvent = asKeyboardEvent(event)
      const maybeResult = f(keyboardEvent.key, keyboardModifiers(keyboardEvent))
      if (Option.isSome(maybeResult)) {
        keyboardEvent.preventDefault()
        const { focusSelector, message } = maybeResult.value
        const target = keyboardEvent.target
        if (target instanceof Element) {
          const focusTarget = target.ownerDocument.querySelector(focusSelector)
          if (focusTarget instanceof HTMLElement) {
            focusTarget.focus()
          }
        }
        dispatch(message)
      }
    }),
  OnKeyUp: (
    f: (key: string, modifiers: KeyboardModifiers) => Message,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>('keyup', event => {
      const keyboardEvent = asKeyboardEvent(event)
      return f(keyboardEvent.key, keyboardModifiers(keyboardEvent))
    }),
  OnKeyUpPreventDefault: (
    f: (key: string, modifiers: KeyboardModifiers) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('keyup', (event, dispatch) => {
      const keyboardEvent = asKeyboardEvent(event)
      const maybeMessage = f(
        keyboardEvent.key,
        keyboardModifiers(keyboardEvent),
      )
      if (Option.isSome(maybeMessage)) {
        keyboardEvent.preventDefault()
        dispatch(maybeMessage.value)
      }
    }),
  OnKeyPress: (
    f: (key: string, modifiers: KeyboardModifiers) => Message,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>('keypress', event => {
      const keyboardEvent = asKeyboardEvent(event)
      return f(keyboardEvent.key, keyboardModifiers(keyboardEvent))
    }),

  // FOCUS

  OnFocus: messageEvent<Model, Message>('focus'),
  /**
   * Blur handler that dispatches `message`, unless the newly-focused
   * element (`relatedTarget`) is the foldkit-devtools panel's host - a blur
   * caused by the panel stealing focus is not the user leaving the element,
   * mirroring og's `OnBlur` devtools accommodation. Routed through
   * `onDispatch` because this guard conditionally skips the dispatch, which
   * `on`'s always-dispatch `toMessage` cannot express.
   */
  OnBlur: conditionalMessageEvent<Model, Message>(
    'blur',
    (event, dispatch, resolveValue) => {
      const focusEvent = asFocusEvent(event)
      if (
        focusEvent.relatedTarget instanceof Element &&
        focusEvent.relatedTarget.id === DEVTOOLS_HOST_ID
      ) {
        return
      }
      dispatch(resolveValue())
    },
  ),

  // FORM

  OnInput: (f: (value: string) => Message): AttrBinding<Model, Message> =>
    on<Model, Message>('input', event => f(inputTarget(event).value)),
  OnChange: (f: (value: string) => Message): AttrBinding<Model, Message> =>
    on<Model, Message>('change', event => f(inputTarget(event).value)),
  OnFileChange: (
    f: (files: ReadonlyArray<File>) => Message,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>('change', event => {
      const target = inputTarget(event)
      const files = filesOf(target.files)
      target.value = ''
      return f(files)
    }),
  OnSubmit: messageEventWithEffect<Model, Message>('submit', event =>
    event.preventDefault(),
  ),
  OnReset: messageEvent<Model, Message>('reset'),
  OnScroll: (f: (scrollTop: number) => Message): AttrBinding<Model, Message> =>
    on<Model, Message>('scroll', event => f(elementTarget(event).scrollTop)),
  OnWheel: messageEvent<Model, Message>('wheel'),

  // CLIPBOARD

  OnCopy: messageEvent<Model, Message>('copy'),
  OnCut: messageEvent<Model, Message>('cut'),
  OnPaste: messageEvent<Model, Message>('paste'),
  OnPastePreventDefault: (
    f: (text: string) => Option.Option<Message>,
  ): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('paste', (event, dispatch) => {
      const clipboardEvent = asClipboardEvent(event)
      const text = clipboardEvent.clipboardData?.getData('text/plain') ?? ''
      const maybeMessage = f(text)
      if (Option.isSome(maybeMessage)) {
        clipboardEvent.preventDefault()
        dispatch(maybeMessage.value)
      }
    }),
  /**
   * Copy handler that synchronously writes `text` to the clipboard as
   * `text/plain` and calls `preventDefault`, when the browser exposes
   * `clipboardData` on the copy event. Never dispatches a Message - og's
   * `OnCopyText` has no Message of its own either. Routed through
   * `onDispatch` since `on` has no "never dispatch" form.
   */
  OnCopyText: (text: string): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('copy', (event, _dispatch) => {
      const clipboardEvent = asClipboardEvent(event)
      if (clipboardEvent.clipboardData) {
        clipboardEvent.clipboardData.setData('text/plain', text)
        clipboardEvent.preventDefault()
      }
    }),
  /**
   * Cut handler that synchronously writes `text` to the clipboard as
   * `text/plain`, calls `preventDefault`, and dispatches `message` - all
   * only when the browser exposes `clipboardData` on the cut event, exactly
   * mirroring og's guard. Routed through `onDispatch` since the dispatch is
   * conditional on that guard.
   */
  OnCutText: onCutTextMember<Model, Message>(),

  // DIALOG

  OnCancel: messageEventWithEffect<Model, Message>('cancel', event =>
    event.preventDefault(),
  ),
  OnToggle: (f: (isOpen: boolean) => Message): AttrBinding<Model, Message> =>
    on<Model, Message>('toggle', event => f(detailsTarget(event).open)),

  // CONTEXT MENU

  OnContextMenu: messageEventWithEffect<Model, Message>('contextmenu', event =>
    event.preventDefault(),
  ),

  // DRAG AND DROP

  OnDragStart: messageEvent<Model, Message>('dragstart'),
  OnDrag: messageEvent<Model, Message>('drag'),
  OnDragEnd: messageEvent<Model, Message>('dragend'),
  /**
   * Dispatches `message` when a drag enters the element's drag zone,
   * tracked per-element (targets entered without a matching leave) so a
   * child element's own `dragenter`/`dragleave` pair does not look like
   * leaving the parent zone. Routed through `onDispatch` since the zone
   * tracking conditionally suppresses the dispatch - mirrors og's
   * `dragZoneTracking.ts` exactly (shared, not reimplemented).
   */
  OnDragEnter: conditionalMessageEvent<Model, Message>(
    'dragenter',
    (event, dispatch, resolveValue) => {
      event.preventDefault()
      const zone = event.currentTarget
      if (!(zone instanceof Element)) {
        dispatch(resolveValue())
        return
      }
      const state = getDragZoneState(zone)
      if (processDragEnter(state, zone, event.target)) {
        dispatch(resolveValue())
      }
    },
  ),
  /**
   * Dispatches `message` when a drag leaves the element's drag zone.
   * NOTE: like og, the dispatch may happen inside a `queueMicrotask` -
   * `processDragLeave` schedules an empty-check that only resolves after
   * the microtask queue drains, self-healing a transient "left" when the
   * pointer crosses from the zone's padding onto a child. This is not
   * `on`'s synchronous-dispatch contract; `onDispatch`'s `handle` is exactly
   * "whatever this needs to do", so the asynchrony carries over unchanged.
   */
  OnDragLeave: conditionalMessageEvent<Model, Message>(
    'dragleave',
    (event, dispatch, resolveValue) => {
      const zone = event.currentTarget
      if (!(zone instanceof Element)) {
        dispatch(resolveValue())
        return
      }
      const state = getDragZoneState(zone)
      if (processDragLeave(state, zone, event.target) === 'schedule') {
        queueMicrotask(() => {
          if (checkScheduledLeave(state)) {
            dispatch(resolveValue())
          }
        })
      }
    },
  ),
  OnDragOver: messageEventWithEffect<Model, Message>('dragover', event =>
    event.preventDefault(),
  ),
  /** Marks the element as a valid drop target by calling `preventDefault`
   *  on every `dragover`, without ever dispatching a Message - mirrors og's
   *  `AllowDrop`. Not `On*`-named (og's own enum spells it `AllowDrop`), but
   *  shares this file's conditional-dispatch primitive so it lives here
   *  rather than in `attributeMembers`. */
  AllowDrop: (): AttrBinding<Model, Message> =>
    onDispatch<Model, Message>('dragover', (event, _dispatch) => {
      event.preventDefault()
    }),
  OnDrop: messageEventWithEffect<Model, Message>('drop', event => {
    event.preventDefault()
    const zone = event.currentTarget
    if (zone instanceof Element) {
      clearDragZoneAfterDrop(zone)
    }
  }),
  OnDropFiles: (
    f: (files: ReadonlyArray<File>) => Message,
  ): AttrBinding<Model, Message> =>
    on<Model, Message>('drop', event => {
      event.preventDefault()
      const dragEvent = asDragEvent(event)
      const zone = dragEvent.currentTarget
      if (zone instanceof Element) {
        clearDragZoneAfterDrop(zone)
      }
      const files = filesOf(dragEvent.dataTransfer?.files ?? null)
      return f(files)
    }),

  // TOUCH

  OnTouchStart: messageEvent<Model, Message>('touchstart'),
  OnTouchEnd: messageEvent<Model, Message>('touchend'),
  OnTouchMove: messageEvent<Model, Message>('touchmove'),
  OnTouchCancel: messageEvent<Model, Message>('touchcancel'),

  // ANIMATION AND TRANSITION

  OnAnimationStart: messageEvent<Model, Message>('animationstart'),
  OnAnimationEnd: messageEvent<Model, Message>('animationend'),
  OnAnimationIteration: messageEvent<Model, Message>('animationiteration'),
  OnTransitionEnd: messageEvent<Model, Message>('transitionend'),

  // MEDIA AND RESOURCE

  OnLoad: messageEvent<Model, Message>('load'),
  OnError: messageEvent<Model, Message>('error'),
  OnPlay: messageEvent<Model, Message>('play'),
  OnPause: messageEvent<Model, Message>('pause'),
  OnEnded: messageEvent<Model, Message>('ended'),
  OnTimeUpdate: messageEvent<Model, Message>('timeupdate'),
  OnVolumeChange: messageEvent<Model, Message>('volumechange'),

  // SELECTION

  OnSelect: messageEvent<Model, Message>('select'),

  // LIFECYCLE

  /** Starts `action`'s Effect fiber when this element mounts, dispatching
   *  each Message its Stream emits; interrupted on unmount. Og signature. */
  OnMount: (
    action: MountAction<Message, unknown>,
  ): AttrBinding<Model, Message> => onMount<Model, Message>(action),
  /** Dispatches `message` when this element is removed from the DOM. Og
   *  signature - see og's extensive `OnUnmount` TSDoc
   *  (`html/index.ts` ~4920-4954) for the backstop-teardown usage pattern,
   *  which still holds unchanged. */
  OnUnmount: (message: Message): AttrBinding<Model, Message> =>
    onUnmount<Model, Message>(message),
})
