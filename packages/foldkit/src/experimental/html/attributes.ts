import type { AttrBinding } from '../bind/binding.js'
import { attr, prop } from '../bind/binding.js'
import type { Value } from './html.js'

// VALUE HELPERS
//
// Every helper below closes over an og attribute name (the exact DOM
// content-attribute name og's interpreter writes, `html/index.ts` ~1200-
// 2660) and returns a factory member. `attr`'s IR value type is
// `string | boolean | Bound<Model, string | boolean>`; members whose og
// value is already `string`/`boolean` pass `value` straight through.
// Members whose og value is `number`, or whose og interpreter coerces a
// `boolean` to the string `"true"`/`"false"` (every `Aria*` boolean, plus
// `Draggable`/`Spellcheck`, which are enumerated content attributes rather
// than presence/absence booleans), stringify through `String`, static or
// `Bound`.

const stringAttr =
  <Model, Message>(name: string) =>
  (value: Value<Model, string>): AttrBinding<Model, Message> =>
    attr(name, value)

const booleanAttr =
  <Model, Message>(name: string) =>
  (value: Value<Model, boolean>): AttrBinding<Model, Message> =>
    attr(name, value)

const numberAttr =
  <Model, Message>(name: string) =>
  (value: Value<Model, number>): AttrBinding<Model, Message> =>
    attr(
      name,
      typeof value === 'function'
        ? (model: Model) => String(value(model))
        : String(value),
    )

const stringifiedBooleanAttr =
  <Model, Message>(name: string) =>
  (value: Value<Model, boolean>): AttrBinding<Model, Message> =>
    attr(
      name,
      typeof value === 'function'
        ? (model: Model) => String(value(model))
        : String(value),
    )

const ariaCheckedAttr =
  <Model, Message>(name: string) =>
  (value: Value<Model, boolean | 'mixed'>): AttrBinding<Model, Message> =>
    attr(
      name,
      typeof value === 'function'
        ? (model: Model) => String(value(model))
        : String(value),
    )

const customAttr =
  <Model, Message>() =>
  (key: string, value: Value<Model, string>): AttrBinding<Model, Message> =>
    attr(key, value)

const dataAttr =
  <Model, Message>() =>
  (key: string, value: Value<Model, string>): AttrBinding<Model, Message> =>
    attr(`data-${key}`, value)

/** camelCase (`backgroundColor`) and already-kebab (`flex-direction`) CSS
 *  property names both appear in real `Style` call sites; only camelCase
 *  needs converting for the inline-style attribute text CSS actually
 *  parses. */
const cssPropertyName = (property: string): string =>
  property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)

/** Serializes a `Style` record to inline `style` attribute text - the
 *  faithful mapping of og's snabbdom style-module object onto a single
 *  HTML attribute, since the IR has no per-property style primitive. */
const toInlineStyle = (style: Readonly<Record<string, string>>): string =>
  Object.entries(style)
    .map(
      ([property, propertyValue]) =>
        `${cssPropertyName(property)}:${propertyValue}`,
    )
    .join(';')

const styleAttr =
  <Model, Message>() =>
  (
    value: Value<Model, Readonly<Record<string, string>>>,
  ): AttrBinding<Model, Message> =>
    attr(
      'style',
      typeof value === 'function'
        ? (model: Model) => toInlineStyle(value(model))
        : toInlineStyle(value),
    )

/** `element.innerHTML = value` - replaces the element's entire subtree, og
 *  semantics preserved exactly. An element using `InnerHTML` must declare no
 *  children; the IR performs no reconciliation between the two. `InnerHTML`
 *  is the one og member whose value the IR cannot express as an HTML
 *  attribute (`setAttribute('innerHTML', …)` is a silent no-op) - it maps
 *  to the IR's `prop` constructor instead, kept internal to this module:
 *  og itself never exposes a public `h.Prop` (only a raw `Attribute` enum
 *  case, consumed internally by `customElement/index.ts` - the same
 *  reverse-parity reason `OnCustomEvent` is excluded from `events.ts`), so
 *  `prop` stays un-surfaced here rather than growing the vocabulary beyond
 *  og's own `html()` factory. */
const innerHtmlMember =
  <Model, Message>() =>
  (value: Value<Model, string>): AttrBinding<Model, Message> =>
    prop('innerHTML', value)

// ATTRIBUTE MEMBERS
//
// Every non-event, non-`Key` member of og's `Attribute<Message>` enum
// (`packages/foldkit/src/html/index.ts:420+`), og name and arity
// preserved exactly, each mapped to the IR's `attr(name, value)`.
//
// One member is excluded: `AllowDrop` (a bare `dragover` listener that
// never dispatches a Message) needs the no-op-capable `OnDispatch` event
// primitive, not `attr`/`prop`, so it ships from `events.ts` instead.
/** The record `attributeMembers` returns: every non-event, non-`Key`,
 *  non-`AllowDrop` member of og's `Attribute<Message>` enum, callable at
 *  its og name and arity. */
export type AttributeMembers<Model, Message> = Readonly<{
  Class: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Id: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Title: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Lang: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Dir: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Tabindex: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Hidden: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Contenteditable: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Draggable: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Accesskey: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Translate: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Inert: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Popover: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Popovertarget: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Popovertargetaction: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  Value: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Checked: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Selected: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Open: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Placeholder: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Name: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Disabled: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Readonly: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Required: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Autofocus: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Spellcheck: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Autocorrect: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Autocapitalize: (value: Value<Model, string>) => AttrBinding<Model, Message>
  InputMode: (value: Value<Model, string>) => AttrBinding<Model, Message>
  EnterKeyHint: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Multiple: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Type: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Accept: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Autocomplete: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Pattern: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Maxlength: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Minlength: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Size: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Cols: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Rows: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Max: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Min: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Step: (value: Value<Model, string>) => AttrBinding<Model, Message>
  For: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Href: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Src: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Alt: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Target: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Rel: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Download: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Action: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Method: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Enctype: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Novalidate: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Formaction: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Formmethod: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Formnovalidate: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Formtarget: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Formenctype: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Colspan: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Rowspan: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Scope: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Headers: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Span: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Start: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Reversed: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  CiteAttr: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Datetime: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Wrap: (value: Value<Model, string>) => AttrBinding<Model, Message>
  List: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FormAttr: (value: Value<Model, string>) => AttrBinding<Model, Message>
  LabelAttr: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ContentAttr: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Charset: (value: Value<Model, string>) => AttrBinding<Model, Message>
  HttpEquiv: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Srcset: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Sizes: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Loading: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Decoding: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Fetchpriority: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Crossorigin: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Referrerpolicy: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Integrity: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Hreflang: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Ping: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Sandbox: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Allow: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Srcdoc: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Autoplay: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Controls: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Loop: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Muted: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Poster: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Preload: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Playsinline: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  High: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Low: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Optimum: (value: Value<Model, number>) => AttrBinding<Model, Message>
  Usemap: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Ismap: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  Role: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaLabel: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaLabelledBy: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaDescribedBy: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaHidden: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaExpanded: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaSelected: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaChecked: (
    value: Value<Model, boolean | 'mixed'>,
  ) => AttrBinding<Model, Message>
  AriaDisabled: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaRequired: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaInvalid: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaLive: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaControls: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaCurrent: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaOrientation: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaPressed: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaHasPopup: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaActiveDescendant: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  AriaSort: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaMultiSelectable: (
    value: Value<Model, boolean>,
  ) => AttrBinding<Model, Message>
  AriaModal: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaBusy: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaErrorMessage: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaRoleDescription: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  AriaAtomic: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaAutocomplete: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaColcount: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaColindex: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaColspan: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaDescription: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaDetails: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaFlowto: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaKeyshortcuts: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaLevel: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaOwns: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaPlaceholder: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaPosinset: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaReadonly: (value: Value<Model, boolean>) => AttrBinding<Model, Message>
  AriaRelevant: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AriaRowcount: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaRowindex: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaRowspan: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaSetsize: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaValuemax: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaValuemin: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaValuenow: (value: Value<Model, number>) => AttrBinding<Model, Message>
  AriaValuetext: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Attribute: (
    key: string,
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  DataAttribute: (
    key: string,
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  Style: (
    value: Value<Model, Readonly<Record<string, string>>>,
  ) => AttrBinding<Model, Message>
  InnerHTML: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ViewBox: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Xmlns: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Fill: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FillRule: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ClipRule: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Stroke: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeWidth: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeLinecap: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeLinejoin: (value: Value<Model, string>) => AttrBinding<Model, Message>
  D: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Cx: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Cy: (value: Value<Model, string>) => AttrBinding<Model, Message>
  R: (value: Value<Model, string>) => AttrBinding<Model, Message>
  X: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Y: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Width: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Height: (value: Value<Model, string>) => AttrBinding<Model, Message>
  X1: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Y1: (value: Value<Model, string>) => AttrBinding<Model, Message>
  X2: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Y2: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Points: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Transform: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Opacity: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeDasharray: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeDashoffset: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Dx: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Dy: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Rotate: (value: Value<Model, string>) => AttrBinding<Model, Message>
  TextAnchor: (value: Value<Model, string>) => AttrBinding<Model, Message>
  DominantBaseline: (value: Value<Model, string>) => AttrBinding<Model, Message>
  AlignmentBaseline: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  BaselineShift: (value: Value<Model, string>) => AttrBinding<Model, Message>
  TextLength: (value: Value<Model, string>) => AttrBinding<Model, Message>
  LengthAdjust: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FontFamily: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FontSize: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FontWeight: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FontStyle: (value: Value<Model, string>) => AttrBinding<Model, Message>
  LetterSpacing: (value: Value<Model, string>) => AttrBinding<Model, Message>
  WordSpacing: (value: Value<Model, string>) => AttrBinding<Model, Message>
  TextDecoration: (value: Value<Model, string>) => AttrBinding<Model, Message>
  WritingMode: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Rx: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Ry: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PathLength: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FillOpacity: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeOpacity: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StrokeMiterlimit: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PaintOrder: (value: Value<Model, string>) => AttrBinding<Model, Message>
  VectorEffect: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Color: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Visibility: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Display: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Overflow: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PointerEvents: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Cursor: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ShapeRendering: (value: Value<Model, string>) => AttrBinding<Model, Message>
  TextRendering: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ImageRendering: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ClipPath: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Mask: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Filter: (value: Value<Model, string>) => AttrBinding<Model, Message>
  ClipPathUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MaskUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MaskContentUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  FilterUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PrimitiveUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Offset: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StopColor: (value: Value<Model, string>) => AttrBinding<Model, Message>
  StopOpacity: (value: Value<Model, string>) => AttrBinding<Model, Message>
  GradientUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  GradientTransform: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  SpreadMethod: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Fx: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Fy: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Fr: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PatternUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PatternContentUnits: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
  PatternTransform: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MarkerStart: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MarkerMid: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MarkerEnd: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MarkerWidth: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MarkerHeight: (value: Value<Model, string>) => AttrBinding<Model, Message>
  MarkerUnits: (value: Value<Model, string>) => AttrBinding<Model, Message>
  RefX: (value: Value<Model, string>) => AttrBinding<Model, Message>
  RefY: (value: Value<Model, string>) => AttrBinding<Model, Message>
  Orient: (value: Value<Model, string>) => AttrBinding<Model, Message>
  PreserveAspectRatio: (
    value: Value<Model, string>,
  ) => AttrBinding<Model, Message>
}>

export const attributeMembers = <Model, Message>(): AttributeMembers<
  Model,
  Message
> => ({
  // GLOBAL / FORM / DOCUMENT STRING ATTRIBUTES
  Class: stringAttr('class'),
  Id: stringAttr('id'),
  Title: stringAttr('title'),
  Lang: stringAttr('lang'),
  Dir: stringAttr('dir'),
  Contenteditable: stringAttr('contenteditable'),
  Accesskey: stringAttr('accesskey'),
  Translate: stringAttr('translate'),
  Popover: stringAttr('popover'),
  Popovertarget: stringAttr('popovertarget'),
  Popovertargetaction: stringAttr('popovertargetaction'),
  // NOTE: Value/Checked/Selected/Open/Muted are live DOM state, not
  // content attributes: og routes exactly these five through
  // `updatePropsWithPostpatch` (html/index.ts:1755-2060) because a user
  // interaction sets the dirty flag, after which `setAttribute` no longer
  // reflects into the property. They map to the IR's `prop()` for the
  // same reason; every other member reflects cleanly through `attr()`.
  Value: (value: Value<Model, string>) => prop<Model, Message>('value', value),
  Placeholder: stringAttr('placeholder'),
  Name: stringAttr('name'),
  Autocorrect: stringAttr('autocorrect'),
  Autocapitalize: stringAttr('autocapitalize'),
  InputMode: stringAttr('inputmode'),
  EnterKeyHint: stringAttr('enterkeyhint'),
  Type: stringAttr('type'),
  Accept: stringAttr('accept'),
  Autocomplete: stringAttr('autocomplete'),
  Pattern: stringAttr('pattern'),
  Max: stringAttr('max'),
  Min: stringAttr('min'),
  Step: stringAttr('step'),
  For: stringAttr('for'),
  Href: stringAttr('href'),
  Src: stringAttr('src'),
  Alt: stringAttr('alt'),
  Target: stringAttr('target'),
  Rel: stringAttr('rel'),
  Download: stringAttr('download'),
  Action: stringAttr('action'),
  Method: stringAttr('method'),
  Enctype: stringAttr('enctype'),
  Formaction: stringAttr('formaction'),
  Formmethod: stringAttr('formmethod'),
  Formtarget: stringAttr('formtarget'),
  Formenctype: stringAttr('formenctype'),
  Scope: stringAttr('scope'),
  Headers: stringAttr('headers'),
  CiteAttr: stringAttr('cite'),
  Datetime: stringAttr('datetime'),
  Wrap: stringAttr('wrap'),
  List: stringAttr('list'),
  FormAttr: stringAttr('form'),
  LabelAttr: stringAttr('label'),
  ContentAttr: stringAttr('content'),
  Charset: stringAttr('charset'),
  HttpEquiv: stringAttr('http-equiv'),
  Srcset: stringAttr('srcset'),
  Sizes: stringAttr('sizes'),
  Loading: stringAttr('loading'),
  Decoding: stringAttr('decoding'),
  Fetchpriority: stringAttr('fetchpriority'),
  Crossorigin: stringAttr('crossorigin'),
  Referrerpolicy: stringAttr('referrerpolicy'),
  Integrity: stringAttr('integrity'),
  Hreflang: stringAttr('hreflang'),
  Ping: stringAttr('ping'),
  Sandbox: stringAttr('sandbox'),
  Allow: stringAttr('allow'),
  Srcdoc: stringAttr('srcdoc'),
  Poster: stringAttr('poster'),
  Preload: stringAttr('preload'),
  Usemap: stringAttr('usemap'),
  Role: stringAttr('role'),

  // NUMERIC ATTRIBUTES
  Tabindex: numberAttr('tabindex'),
  Maxlength: numberAttr('maxlength'),
  Minlength: numberAttr('minlength'),
  Size: numberAttr('size'),
  Cols: numberAttr('cols'),
  Rows: numberAttr('rows'),
  Colspan: numberAttr('colspan'),
  Rowspan: numberAttr('rowspan'),
  Span: numberAttr('span'),
  Start: numberAttr('start'),
  High: numberAttr('high'),
  Low: numberAttr('low'),
  Optimum: numberAttr('optimum'),

  // NATIVE BOOLEAN ATTRIBUTES (presence/absence, mirroring og's DOM-property
  // reflection through the IR's existing boolean `writeAttr` handling)
  Hidden: booleanAttr('hidden'),
  Inert: booleanAttr('inert'),
  Checked: (value: Value<Model, boolean>) =>
    prop<Model, Message>('checked', value),
  Selected: (value: Value<Model, boolean>) =>
    prop<Model, Message>('selected', value),
  Open: (value: Value<Model, boolean>) => prop<Model, Message>('open', value),
  Disabled: booleanAttr('disabled'),
  Readonly: booleanAttr('readonly'),
  Required: booleanAttr('required'),
  Autofocus: booleanAttr('autofocus'),
  Multiple: booleanAttr('multiple'),
  Novalidate: booleanAttr('novalidate'),
  Formnovalidate: booleanAttr('formnovalidate'),
  Reversed: booleanAttr('reversed'),
  Autoplay: booleanAttr('autoplay'),
  Controls: booleanAttr('controls'),
  Loop: booleanAttr('loop'),
  Muted: (value: Value<Model, boolean>) => prop<Model, Message>('muted', value),
  Playsinline: booleanAttr('playsinline'),
  Ismap: booleanAttr('ismap'),

  // ENUMERATED-STRING BOOLEANS: og stringifies these (`value.toString()`)
  // rather than toggling presence, since `draggable`/`spellcheck` are
  // enumerated content attributes ("true"/"false" keywords), not true
  // HTML boolean attributes - an empty-string `draggable=""` would fall
  // to the spec's invalid-value default instead of meaning `true`.
  Draggable: stringifiedBooleanAttr('draggable'),
  Spellcheck: stringifiedBooleanAttr('spellcheck'),

  // ARIA STRING ATTRIBUTES
  AriaLabel: stringAttr('aria-label'),
  AriaLabelledBy: stringAttr('aria-labelledby'),
  AriaDescribedBy: stringAttr('aria-describedby'),
  AriaLive: stringAttr('aria-live'),
  AriaControls: stringAttr('aria-controls'),
  AriaCurrent: stringAttr('aria-current'),
  AriaOrientation: stringAttr('aria-orientation'),
  AriaPressed: stringAttr('aria-pressed'),
  AriaHasPopup: stringAttr('aria-haspopup'),
  AriaActiveDescendant: stringAttr('aria-activedescendant'),
  AriaSort: stringAttr('aria-sort'),
  AriaErrorMessage: stringAttr('aria-errormessage'),
  AriaRoleDescription: stringAttr('aria-roledescription'),
  AriaAutocomplete: stringAttr('aria-autocomplete'),
  AriaDescription: stringAttr('aria-description'),
  AriaDetails: stringAttr('aria-details'),
  AriaFlowto: stringAttr('aria-flowto'),
  AriaKeyshortcuts: stringAttr('aria-keyshortcuts'),
  AriaOwns: stringAttr('aria-owns'),
  AriaPlaceholder: stringAttr('aria-placeholder'),
  AriaRelevant: stringAttr('aria-relevant'),
  AriaValuetext: stringAttr('aria-valuetext'),

  // ARIA BOOLEAN ATTRIBUTES: per the WAI-ARIA spec these are string
  // state values, always present - og always stringifies
  // (`value.toString()`) rather than toggling presence/absence.
  AriaHidden: stringifiedBooleanAttr('aria-hidden'),
  AriaExpanded: stringifiedBooleanAttr('aria-expanded'),
  AriaSelected: stringifiedBooleanAttr('aria-selected'),
  AriaDisabled: stringifiedBooleanAttr('aria-disabled'),
  AriaRequired: stringifiedBooleanAttr('aria-required'),
  AriaInvalid: stringifiedBooleanAttr('aria-invalid'),
  AriaMultiSelectable: stringifiedBooleanAttr('aria-multiselectable'),
  AriaModal: stringifiedBooleanAttr('aria-modal'),
  AriaBusy: stringifiedBooleanAttr('aria-busy'),
  AriaAtomic: stringifiedBooleanAttr('aria-atomic'),
  AriaReadonly: stringifiedBooleanAttr('aria-readonly'),
  AriaChecked: ariaCheckedAttr('aria-checked'),

  // ARIA NUMERIC ATTRIBUTES
  AriaColcount: numberAttr('aria-colcount'),
  AriaColindex: numberAttr('aria-colindex'),
  AriaColspan: numberAttr('aria-colspan'),
  AriaLevel: numberAttr('aria-level'),
  AriaPosinset: numberAttr('aria-posinset'),
  AriaRowcount: numberAttr('aria-rowcount'),
  AriaRowindex: numberAttr('aria-rowindex'),
  AriaRowspan: numberAttr('aria-rowspan'),
  AriaSetsize: numberAttr('aria-setsize'),
  AriaValuemax: numberAttr('aria-valuemax'),
  AriaValuemin: numberAttr('aria-valuemin'),
  AriaValuenow: numberAttr('aria-valuenow'),

  // CUSTOM / DATA-* ESCAPE HATCHES
  Attribute: customAttr(),
  DataAttribute: dataAttr(),

  // INLINE STYLE
  Style: styleAttr(),
  InnerHTML: innerHtmlMember(),

  // SVG / MATHML PRESENTATION ATTRIBUTES
  ViewBox: stringAttr('viewBox'),
  Xmlns: stringAttr('xmlns'),
  Fill: stringAttr('fill'),
  FillRule: stringAttr('fill-rule'),
  ClipRule: stringAttr('clip-rule'),
  Stroke: stringAttr('stroke'),
  StrokeWidth: stringAttr('stroke-width'),
  StrokeLinecap: stringAttr('stroke-linecap'),
  StrokeLinejoin: stringAttr('stroke-linejoin'),
  D: stringAttr('d'),
  Cx: stringAttr('cx'),
  Cy: stringAttr('cy'),
  R: stringAttr('r'),
  X: stringAttr('x'),
  Y: stringAttr('y'),
  Width: stringAttr('width'),
  Height: stringAttr('height'),
  X1: stringAttr('x1'),
  Y1: stringAttr('y1'),
  X2: stringAttr('x2'),
  Y2: stringAttr('y2'),
  Points: stringAttr('points'),
  Transform: stringAttr('transform'),
  Opacity: stringAttr('opacity'),
  StrokeDasharray: stringAttr('stroke-dasharray'),
  StrokeDashoffset: stringAttr('stroke-dashoffset'),
  Dx: stringAttr('dx'),
  Dy: stringAttr('dy'),
  Rotate: stringAttr('rotate'),
  TextAnchor: stringAttr('text-anchor'),
  DominantBaseline: stringAttr('dominant-baseline'),
  AlignmentBaseline: stringAttr('alignment-baseline'),
  BaselineShift: stringAttr('baseline-shift'),
  TextLength: stringAttr('textLength'),
  LengthAdjust: stringAttr('lengthAdjust'),
  FontFamily: stringAttr('font-family'),
  FontSize: stringAttr('font-size'),
  FontWeight: stringAttr('font-weight'),
  FontStyle: stringAttr('font-style'),
  LetterSpacing: stringAttr('letter-spacing'),
  WordSpacing: stringAttr('word-spacing'),
  TextDecoration: stringAttr('text-decoration'),
  WritingMode: stringAttr('writing-mode'),
  Rx: stringAttr('rx'),
  Ry: stringAttr('ry'),
  PathLength: stringAttr('pathLength'),
  FillOpacity: stringAttr('fill-opacity'),
  StrokeOpacity: stringAttr('stroke-opacity'),
  StrokeMiterlimit: stringAttr('stroke-miterlimit'),
  PaintOrder: stringAttr('paint-order'),
  VectorEffect: stringAttr('vector-effect'),
  Color: stringAttr('color'),
  Visibility: stringAttr('visibility'),
  Display: stringAttr('display'),
  Overflow: stringAttr('overflow'),
  PointerEvents: stringAttr('pointer-events'),
  Cursor: stringAttr('cursor'),
  ShapeRendering: stringAttr('shape-rendering'),
  TextRendering: stringAttr('text-rendering'),
  ImageRendering: stringAttr('image-rendering'),
  ClipPath: stringAttr('clip-path'),
  Mask: stringAttr('mask'),
  Filter: stringAttr('filter'),
  ClipPathUnits: stringAttr('clipPathUnits'),
  MaskUnits: stringAttr('maskUnits'),
  MaskContentUnits: stringAttr('maskContentUnits'),
  FilterUnits: stringAttr('filterUnits'),
  PrimitiveUnits: stringAttr('primitiveUnits'),
  Offset: stringAttr('offset'),
  StopColor: stringAttr('stop-color'),
  StopOpacity: stringAttr('stop-opacity'),
  GradientUnits: stringAttr('gradientUnits'),
  GradientTransform: stringAttr('gradientTransform'),
  SpreadMethod: stringAttr('spreadMethod'),
  Fx: stringAttr('fx'),
  Fy: stringAttr('fy'),
  Fr: stringAttr('fr'),
  PatternUnits: stringAttr('patternUnits'),
  PatternContentUnits: stringAttr('patternContentUnits'),
  PatternTransform: stringAttr('patternTransform'),
  MarkerStart: stringAttr('marker-start'),
  MarkerMid: stringAttr('marker-mid'),
  MarkerEnd: stringAttr('marker-end'),
  MarkerWidth: stringAttr('markerWidth'),
  MarkerHeight: stringAttr('markerHeight'),
  MarkerUnits: stringAttr('markerUnits'),
  RefX: stringAttr('refX'),
  RefY: stringAttr('refY'),
  Orient: stringAttr('orient'),
  PreserveAspectRatio: stringAttr('preserveAspectRatio'),
})
