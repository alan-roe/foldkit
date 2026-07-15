import type { AttrBinding, Binding, Bound } from '../bind/binding.js'
import {
  cond as condBinding,
  el,
  list as listBinding,
  text,
} from '../bind/binding.js'
import {
  matchTag as matchTagBinding,
  when as whenBinding,
} from '../bind/helpers.js'
import {
  type DynamicInputs,
  type PublishedGroups,
  submodel as submodelBinding,
} from '../bind/submodel.js'
import { type AttributeMembers, attributeMembers } from './attributes.js'
import { eventMembers } from './events.js'

// VALUE AND CHILD POSITIONS

/**
 * An attribute value position: either a static literal or a `Bound` read of
 * `Model`. Static values are legal - `h.Class('todo-list')` is not the
 * ADR's rejected eager-values-that-update-on-a-diffing-path alternative,
 * which concerned a runtime that re-diffs an already-mounted tree. Under
 * mount-once semantics static-vs-thunk IS the contract: a static value is
 * baked into the DOM once at mount, a `Bound` thunk is re-read on every
 * render pass. The `no-eager-bind-reads` lint rule (not this type) is what
 * guards against a thunk closing over a frozen `Model` read.
 */
export type Value<Model, A> = A | Bound<Model, A>

/**
 * A child position: a nested `Binding`, a static string (a text node), a
 * `Bound<Model, string>` thunk (a text hole, kept mechanical to translate
 * from a value read like `[todo.title]`), or `null` (skipped entirely -
 * see {@link empty}).
 */
export type Child<Model, Message> =
  | Binding<Model, Message>
  | string
  | Bound<Model, string>
  | null

// ELEMENT CONSTRUCTORS

type ElementConstructor<Model, Message> = (
  attributes?: ReadonlyArray<AttrBinding<Model, Message>>,
  children?: ReadonlyArray<Child<Model, Message>>,
) => Binding<Model, Message>

type VoidElementConstructor<Model, Message> = (
  attributes?: ReadonlyArray<AttrBinding<Model, Message>>,
) => Binding<Model, Message>

/**
 * Every HTML, SVG, and MathML element constructor, one per tag in og's
 * `TagName` union (`packages/foldkit/src/html/index.ts`). Normal elements
 * take attributes and children; void elements (`area`/`base`/`br`/`col`/
 * `embed`/`hr`/`img`/`input`/`link`/`meta`/`source`/`track`/`wbr`) take
 * attributes only, mirroring the DOM's own void-element set.
 */
type HtmlElements<Model, Message> = Readonly<{
  a: ElementConstructor<Model, Message>
  abbr: ElementConstructor<Model, Message>
  address: ElementConstructor<Model, Message>
  area: VoidElementConstructor<Model, Message>
  article: ElementConstructor<Model, Message>
  aside: ElementConstructor<Model, Message>
  audio: ElementConstructor<Model, Message>
  b: ElementConstructor<Model, Message>
  base: VoidElementConstructor<Model, Message>
  bdi: ElementConstructor<Model, Message>
  bdo: ElementConstructor<Model, Message>
  blockquote: ElementConstructor<Model, Message>
  body: ElementConstructor<Model, Message>
  br: VoidElementConstructor<Model, Message>
  button: ElementConstructor<Model, Message>
  canvas: ElementConstructor<Model, Message>
  caption: ElementConstructor<Model, Message>
  cite: ElementConstructor<Model, Message>
  code: ElementConstructor<Model, Message>
  col: VoidElementConstructor<Model, Message>
  colgroup: ElementConstructor<Model, Message>
  data: ElementConstructor<Model, Message>
  datalist: ElementConstructor<Model, Message>
  dd: ElementConstructor<Model, Message>
  del: ElementConstructor<Model, Message>
  details: ElementConstructor<Model, Message>
  dfn: ElementConstructor<Model, Message>
  dialog: ElementConstructor<Model, Message>
  div: ElementConstructor<Model, Message>
  dl: ElementConstructor<Model, Message>
  dt: ElementConstructor<Model, Message>
  em: ElementConstructor<Model, Message>
  embed: VoidElementConstructor<Model, Message>
  fieldset: ElementConstructor<Model, Message>
  figcaption: ElementConstructor<Model, Message>
  figure: ElementConstructor<Model, Message>
  footer: ElementConstructor<Model, Message>
  form: ElementConstructor<Model, Message>
  h1: ElementConstructor<Model, Message>
  h2: ElementConstructor<Model, Message>
  h3: ElementConstructor<Model, Message>
  h4: ElementConstructor<Model, Message>
  h5: ElementConstructor<Model, Message>
  h6: ElementConstructor<Model, Message>
  head: ElementConstructor<Model, Message>
  header: ElementConstructor<Model, Message>
  hgroup: ElementConstructor<Model, Message>
  hr: VoidElementConstructor<Model, Message>
  html: ElementConstructor<Model, Message>
  i: ElementConstructor<Model, Message>
  iframe: ElementConstructor<Model, Message>
  img: VoidElementConstructor<Model, Message>
  input: VoidElementConstructor<Model, Message>
  ins: ElementConstructor<Model, Message>
  kbd: ElementConstructor<Model, Message>
  label: ElementConstructor<Model, Message>
  legend: ElementConstructor<Model, Message>
  li: ElementConstructor<Model, Message>
  link: VoidElementConstructor<Model, Message>
  main: ElementConstructor<Model, Message>
  map: ElementConstructor<Model, Message>
  mark: ElementConstructor<Model, Message>
  menu: ElementConstructor<Model, Message>
  meta: VoidElementConstructor<Model, Message>
  meter: ElementConstructor<Model, Message>
  nav: ElementConstructor<Model, Message>
  noscript: ElementConstructor<Model, Message>
  object: ElementConstructor<Model, Message>
  ol: ElementConstructor<Model, Message>
  optgroup: ElementConstructor<Model, Message>
  option: ElementConstructor<Model, Message>
  output: ElementConstructor<Model, Message>
  p: ElementConstructor<Model, Message>
  picture: ElementConstructor<Model, Message>
  portal: ElementConstructor<Model, Message>
  pre: ElementConstructor<Model, Message>
  progress: ElementConstructor<Model, Message>
  q: ElementConstructor<Model, Message>
  rp: ElementConstructor<Model, Message>
  rt: ElementConstructor<Model, Message>
  ruby: ElementConstructor<Model, Message>
  s: ElementConstructor<Model, Message>
  samp: ElementConstructor<Model, Message>
  script: ElementConstructor<Model, Message>
  search: ElementConstructor<Model, Message>
  section: ElementConstructor<Model, Message>
  select: ElementConstructor<Model, Message>
  slot: ElementConstructor<Model, Message>
  small: ElementConstructor<Model, Message>
  source: VoidElementConstructor<Model, Message>
  span: ElementConstructor<Model, Message>
  strong: ElementConstructor<Model, Message>
  style: ElementConstructor<Model, Message>
  sub: ElementConstructor<Model, Message>
  summary: ElementConstructor<Model, Message>
  sup: ElementConstructor<Model, Message>
  table: ElementConstructor<Model, Message>
  tbody: ElementConstructor<Model, Message>
  td: ElementConstructor<Model, Message>
  template: ElementConstructor<Model, Message>
  textarea: ElementConstructor<Model, Message>
  tfoot: ElementConstructor<Model, Message>
  th: ElementConstructor<Model, Message>
  thead: ElementConstructor<Model, Message>
  time: ElementConstructor<Model, Message>
  title: ElementConstructor<Model, Message>
  tr: ElementConstructor<Model, Message>
  track: VoidElementConstructor<Model, Message>
  u: ElementConstructor<Model, Message>
  ul: ElementConstructor<Model, Message>
  var: ElementConstructor<Model, Message>
  video: ElementConstructor<Model, Message>
  wbr: VoidElementConstructor<Model, Message>
  svg: ElementConstructor<Model, Message>
  animate: ElementConstructor<Model, Message>
  animateMotion: ElementConstructor<Model, Message>
  animateTransform: ElementConstructor<Model, Message>
  circle: ElementConstructor<Model, Message>
  clipPath: ElementConstructor<Model, Message>
  defs: ElementConstructor<Model, Message>
  desc: ElementConstructor<Model, Message>
  ellipse: ElementConstructor<Model, Message>
  feBlend: ElementConstructor<Model, Message>
  feColorMatrix: ElementConstructor<Model, Message>
  feComponentTransfer: ElementConstructor<Model, Message>
  feComposite: ElementConstructor<Model, Message>
  feConvolveMatrix: ElementConstructor<Model, Message>
  feDiffuseLighting: ElementConstructor<Model, Message>
  feDisplacementMap: ElementConstructor<Model, Message>
  feDistantLight: ElementConstructor<Model, Message>
  feDropShadow: ElementConstructor<Model, Message>
  feFlood: ElementConstructor<Model, Message>
  feFuncA: ElementConstructor<Model, Message>
  feFuncB: ElementConstructor<Model, Message>
  feFuncG: ElementConstructor<Model, Message>
  feFuncR: ElementConstructor<Model, Message>
  feGaussianBlur: ElementConstructor<Model, Message>
  feImage: ElementConstructor<Model, Message>
  feMerge: ElementConstructor<Model, Message>
  feMergeNode: ElementConstructor<Model, Message>
  feMorphology: ElementConstructor<Model, Message>
  feOffset: ElementConstructor<Model, Message>
  fePointLight: ElementConstructor<Model, Message>
  feSpecularLighting: ElementConstructor<Model, Message>
  feSpotLight: ElementConstructor<Model, Message>
  feTile: ElementConstructor<Model, Message>
  feTurbulence: ElementConstructor<Model, Message>
  filter: ElementConstructor<Model, Message>
  foreignObject: ElementConstructor<Model, Message>
  g: ElementConstructor<Model, Message>
  image: ElementConstructor<Model, Message>
  line: ElementConstructor<Model, Message>
  linearGradient: ElementConstructor<Model, Message>
  marker: ElementConstructor<Model, Message>
  mask: ElementConstructor<Model, Message>
  metadata: ElementConstructor<Model, Message>
  mpath: ElementConstructor<Model, Message>
  path: ElementConstructor<Model, Message>
  pattern: ElementConstructor<Model, Message>
  polygon: ElementConstructor<Model, Message>
  polyline: ElementConstructor<Model, Message>
  radialGradient: ElementConstructor<Model, Message>
  rect: ElementConstructor<Model, Message>
  set: ElementConstructor<Model, Message>
  stop: ElementConstructor<Model, Message>
  switch: ElementConstructor<Model, Message>
  symbol: ElementConstructor<Model, Message>
  text: ElementConstructor<Model, Message>
  textPath: ElementConstructor<Model, Message>
  tspan: ElementConstructor<Model, Message>
  use: ElementConstructor<Model, Message>
  view: ElementConstructor<Model, Message>
  math: ElementConstructor<Model, Message>
  annotation: ElementConstructor<Model, Message>
  'annotation-xml': ElementConstructor<Model, Message>
  maction: ElementConstructor<Model, Message>
  menclose: ElementConstructor<Model, Message>
  merror: ElementConstructor<Model, Message>
  mfenced: ElementConstructor<Model, Message>
  mfrac: ElementConstructor<Model, Message>
  mglyph: ElementConstructor<Model, Message>
  mi: ElementConstructor<Model, Message>
  mlabeledtr: ElementConstructor<Model, Message>
  mlongdiv: ElementConstructor<Model, Message>
  mmultiscripts: ElementConstructor<Model, Message>
  mn: ElementConstructor<Model, Message>
  mo: ElementConstructor<Model, Message>
  mover: ElementConstructor<Model, Message>
  mpadded: ElementConstructor<Model, Message>
  mphantom: ElementConstructor<Model, Message>
  mprescripts: ElementConstructor<Model, Message>
  mroot: ElementConstructor<Model, Message>
  mrow: ElementConstructor<Model, Message>
  ms: ElementConstructor<Model, Message>
  mscarries: ElementConstructor<Model, Message>
  mscarry: ElementConstructor<Model, Message>
  msgroup: ElementConstructor<Model, Message>
  msline: ElementConstructor<Model, Message>
  mspace: ElementConstructor<Model, Message>
  msqrt: ElementConstructor<Model, Message>
  msrow: ElementConstructor<Model, Message>
  mstack: ElementConstructor<Model, Message>
  mstyle: ElementConstructor<Model, Message>
  msub: ElementConstructor<Model, Message>
  msubsup: ElementConstructor<Model, Message>
  msup: ElementConstructor<Model, Message>
  mtable: ElementConstructor<Model, Message>
  mtd: ElementConstructor<Model, Message>
  mtext: ElementConstructor<Model, Message>
  mtr: ElementConstructor<Model, Message>
  munder: ElementConstructor<Model, Message>
  munderover: ElementConstructor<Model, Message>
  semantics: ElementConstructor<Model, Message>
}>

const normalizeChild = <Model, Message>(
  child: Child<Model, Message>,
): Binding<Model, Message> | null => {
  if (child === null) {
    return null
  }
  if (typeof child === 'string' || typeof child === 'function') {
    return text<Model, Message>(child)
  }
  return child
}

const normalizeChildren = <Model, Message>(
  children: ReadonlyArray<Child<Model, Message>>,
): ReadonlyArray<Binding<Model, Message>> =>
  children
    .map(normalizeChild<Model, Message>)
    .filter((child): child is Binding<Model, Message> => child !== null)

const makeElement =
  <Model, Message>() =>
  (tagName: string): ElementConstructor<Model, Message> =>
  (attributes = [], children = []) =>
    el<Model, Message>(tagName, attributes, normalizeChildren(children))

const makeVoidElement =
  <Model, Message>() =>
  (tagName: string): VoidElementConstructor<Model, Message> =>
  (attributes = []) =>
    el<Model, Message>(tagName, attributes, [])

const buildHtmlElements = <Model, Message>(): HtmlElements<Model, Message> => {
  const element = makeElement<Model, Message>()
  const voidElement = makeVoidElement<Model, Message>()

  return {
    a: element('a'),
    abbr: element('abbr'),
    address: element('address'),
    area: voidElement('area'),
    article: element('article'),
    aside: element('aside'),
    audio: element('audio'),
    b: element('b'),
    base: voidElement('base'),
    bdi: element('bdi'),
    bdo: element('bdo'),
    blockquote: element('blockquote'),
    body: element('body'),
    br: voidElement('br'),
    button: element('button'),
    canvas: element('canvas'),
    caption: element('caption'),
    cite: element('cite'),
    code: element('code'),
    col: voidElement('col'),
    colgroup: element('colgroup'),
    data: element('data'),
    datalist: element('datalist'),
    dd: element('dd'),
    del: element('del'),
    details: element('details'),
    dfn: element('dfn'),
    dialog: element('dialog'),
    div: element('div'),
    dl: element('dl'),
    dt: element('dt'),
    em: element('em'),
    embed: voidElement('embed'),
    fieldset: element('fieldset'),
    figcaption: element('figcaption'),
    figure: element('figure'),
    footer: element('footer'),
    form: element('form'),
    h1: element('h1'),
    h2: element('h2'),
    h3: element('h3'),
    h4: element('h4'),
    h5: element('h5'),
    h6: element('h6'),
    head: element('head'),
    header: element('header'),
    hgroup: element('hgroup'),
    hr: voidElement('hr'),
    html: element('html'),
    i: element('i'),
    iframe: element('iframe'),
    img: voidElement('img'),
    input: voidElement('input'),
    ins: element('ins'),
    kbd: element('kbd'),
    label: element('label'),
    legend: element('legend'),
    li: element('li'),
    link: voidElement('link'),
    main: element('main'),
    map: element('map'),
    mark: element('mark'),
    menu: element('menu'),
    meta: voidElement('meta'),
    meter: element('meter'),
    nav: element('nav'),
    noscript: element('noscript'),
    object: element('object'),
    ol: element('ol'),
    optgroup: element('optgroup'),
    option: element('option'),
    output: element('output'),
    p: element('p'),
    picture: element('picture'),
    portal: element('portal'),
    pre: element('pre'),
    progress: element('progress'),
    q: element('q'),
    rp: element('rp'),
    rt: element('rt'),
    ruby: element('ruby'),
    s: element('s'),
    samp: element('samp'),
    script: element('script'),
    search: element('search'),
    section: element('section'),
    select: element('select'),
    slot: element('slot'),
    small: element('small'),
    source: voidElement('source'),
    span: element('span'),
    strong: element('strong'),
    style: element('style'),
    sub: element('sub'),
    summary: element('summary'),
    sup: element('sup'),
    table: element('table'),
    tbody: element('tbody'),
    td: element('td'),
    template: element('template'),
    textarea: element('textarea'),
    tfoot: element('tfoot'),
    th: element('th'),
    thead: element('thead'),
    time: element('time'),
    title: element('title'),
    tr: element('tr'),
    track: voidElement('track'),
    u: element('u'),
    ul: element('ul'),
    var: element('var'),
    video: element('video'),
    wbr: voidElement('wbr'),
    svg: element('svg'),
    animate: element('animate'),
    animateMotion: element('animateMotion'),
    animateTransform: element('animateTransform'),
    circle: element('circle'),
    clipPath: element('clipPath'),
    defs: element('defs'),
    desc: element('desc'),
    ellipse: element('ellipse'),
    feBlend: element('feBlend'),
    feColorMatrix: element('feColorMatrix'),
    feComponentTransfer: element('feComponentTransfer'),
    feComposite: element('feComposite'),
    feConvolveMatrix: element('feConvolveMatrix'),
    feDiffuseLighting: element('feDiffuseLighting'),
    feDisplacementMap: element('feDisplacementMap'),
    feDistantLight: element('feDistantLight'),
    feDropShadow: element('feDropShadow'),
    feFlood: element('feFlood'),
    feFuncA: element('feFuncA'),
    feFuncB: element('feFuncB'),
    feFuncG: element('feFuncG'),
    feFuncR: element('feFuncR'),
    feGaussianBlur: element('feGaussianBlur'),
    feImage: element('feImage'),
    feMerge: element('feMerge'),
    feMergeNode: element('feMergeNode'),
    feMorphology: element('feMorphology'),
    feOffset: element('feOffset'),
    fePointLight: element('fePointLight'),
    feSpecularLighting: element('feSpecularLighting'),
    feSpotLight: element('feSpotLight'),
    feTile: element('feTile'),
    feTurbulence: element('feTurbulence'),
    filter: element('filter'),
    foreignObject: element('foreignObject'),
    g: element('g'),
    image: element('image'),
    line: element('line'),
    linearGradient: element('linearGradient'),
    marker: element('marker'),
    mask: element('mask'),
    metadata: element('metadata'),
    mpath: element('mpath'),
    path: element('path'),
    pattern: element('pattern'),
    polygon: element('polygon'),
    polyline: element('polyline'),
    radialGradient: element('radialGradient'),
    rect: element('rect'),
    set: element('set'),
    stop: element('stop'),
    switch: element('switch'),
    symbol: element('symbol'),
    text: element('text'),
    textPath: element('textPath'),
    tspan: element('tspan'),
    use: element('use'),
    view: element('view'),
    math: element('math'),
    annotation: element('annotation'),
    'annotation-xml': element('annotation-xml'),
    maction: element('maction'),
    menclose: element('menclose'),
    merror: element('merror'),
    mfenced: element('mfenced'),
    mfrac: element('mfrac'),
    mglyph: element('mglyph'),
    mi: element('mi'),
    mlabeledtr: element('mlabeledtr'),
    mlongdiv: element('mlongdiv'),
    mmultiscripts: element('mmultiscripts'),
    mn: element('mn'),
    mo: element('mo'),
    mover: element('mover'),
    mpadded: element('mpadded'),
    mphantom: element('mphantom'),
    mprescripts: element('mprescripts'),
    mroot: element('mroot'),
    mrow: element('mrow'),
    ms: element('ms'),
    mscarries: element('mscarries'),
    mscarry: element('mscarry'),
    msgroup: element('msgroup'),
    msline: element('msline'),
    mspace: element('mspace'),
    msqrt: element('msqrt'),
    msrow: element('msrow'),
    mstack: element('mstack'),
    mstyle: element('mstyle'),
    msub: element('msub'),
    msubsup: element('msubsup'),
    msup: element('msup'),
    mtable: element('mtable'),
    mtd: element('mtd'),
    mtext: element('mtext'),
    mtr: element('mtr'),
    munder: element('munder'),
    munderover: element('munderover'),
    semantics: element('semantics'),
  }
}

// STRUCTURAL MEMBERS

/**
 * A keyed list rendered from `select(model)`. Migrates og's
 * `h.keyed(tag)(key, attrs, children)` inside `Array.map` (deleted, not
 * ported - `list`/`cond` key by construction, so a separate `Key`
 * attribute is redundant): replace
 * `todos.map((todo) => h.keyed('li')(todo.id, [...], [...]))` with
 * `h.list(model => model.todos, todo => todo.id, readTodo => h.li([...], [...]))`.
 * `renderItem` receives a thunk rather than the item itself, so a live
 * renderer can rebind a row to a per-item signal without re-walking the
 * binding tree.
 */
type ListMember<Model, Message> = <Item>(
  select: Bound<Model, ReadonlyArray<Item>>,
  toKey: (item: Item) => string,
  renderItem: (readItem: () => Item) => Binding<Model, Message>,
) => Binding<Model, Message>

/** A discriminated branch chosen by `discriminant(model)`, keyed by the
 *  resulting string. */
type CondMember<Model, Message> = (
  discriminant: Bound<Model, string>,
  renderBranch: (key: string) => Binding<Model, Message>,
) => Binding<Model, Message>

/** A keyed if/else: sugar over `cond` using the fixed keys `'True'`/
 *  `'False'`, so a render pass swaps branches only when `predicate` flips
 *  rather than re-rendering on every read. `renderFalse` defaults to an
 *  empty text-node branch. */
type WhenMember<Model, Message> = (
  predicate: Bound<Model, boolean>,
  renderTrue: () => Binding<Model, Message>,
  renderFalse?: () => Binding<Model, Message>,
) => Binding<Model, Message>

/**
 * A compile-time exhaustive discriminated branch over `A`'s `_tag` union:
 * `branches` is a total record, so a missing arm is a type error, not a
 * runtime throw. Dispatches on `select(model)._tag`.
 */
type MatchTagMember<Model, Message> = <A extends Readonly<{ _tag: string }>>(
  select: Bound<Model, A>,
  branches: Readonly<{ [K in A['_tag']]: () => Binding<Model, Message> }>,
) => Binding<Model, Message>

/** Embeds a child Submodel boundary, `Parent`/`ParentMessage` pinned to
 *  this factory's `Model`/`Message`. See `submodel` in
 *  `../bind/submodel.js` for the full lift-table semantics. */
type SubmodelMember<Model, Message> = <
  Child,
  ChildMessage,
  Shape extends Readonly<Record<string, unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- default "no extra dynamic inputs" shape, mirrors ../bind/submodel.js.
  Extra extends Readonly<Record<string, unknown>> = {},
>(
  config: Readonly<{
    select: Bound<Model, Child>
    toMessage: (childMessage: ChildMessage) => Message
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
        published: PublishedGroups<Model, Message, Shape>,
      ) => Binding<Model, Message>
    }> &
      DynamicInputs<Model, Extra>
  }>,
) => Binding<Model, Message>

type StructuralMembers<Model, Message> = Readonly<{
  list: ListMember<Model, Message>
  cond: CondMember<Model, Message>
  when: WhenMember<Model, Message>
  matchTag: MatchTagMember<Model, Message>
  submodel: SubmodelMember<Model, Message>
  /** Renders nothing: `Child` includes `null`, and `normalizeChildren`
   *  skips it entirely at build time. Mirrors og's `empty: null`. */
  empty: null
}>

const makeList =
  <Model, Message>(): ListMember<Model, Message> =>
  <Item>(
    select: Bound<Model, ReadonlyArray<Item>>,
    toKey: (item: Item) => string,
    renderItem: (readItem: () => Item) => Binding<Model, Message>,
  ): Binding<Model, Message> =>
    listBinding<Model, Message, Item>(select, toKey, renderItem)

const makeCond =
  <Model, Message>(): CondMember<Model, Message> =>
  (discriminant, renderBranch) =>
    condBinding<Model, Message>(discriminant, renderBranch)

const makeWhen =
  <Model, Message>(): WhenMember<Model, Message> =>
  (predicate, renderTrue, renderFalse) =>
    whenBinding<Model, Message>(predicate, renderTrue, renderFalse)

const makeMatchTag =
  <Model, Message>(): MatchTagMember<Model, Message> =>
  (select, branches) =>
    matchTagBinding<Model, Message>(
      model => select(model)._tag,
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `branches` is a total record keyed by `A['_tag']`; the IR `matchTag` is generic over a plain string discriminant and needs the widened `Record<string, ...>` shape. Compile-time exhaustiveness is enforced by this member's own `branches` parameter type above, not by the IR call. */
      branches as unknown as Readonly<
        Record<string, () => Binding<Model, Message>>
      >,
    )

const makeSubmodel = <Model, Message>(): SubmodelMember<Model, Message> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- generic erasure boundary: `submodelBinding` is honestly generic over `Parent`/`ParentMessage`/`Child`/`ChildMessage`/`Shape`/`Extra` (../bind/submodel.js), behaviorally identical to `SubmodelMember<Model, Message>` with `Parent`/`ParentMessage` pinned - same precedent as `submodel.ts`'s own `Sub`/`Host` union-boundary casts (submodel.ts:199-247). */
  submodelBinding as unknown as SubmodelMember<Model, Message>

// FACTORY

/**
 * The `html<Model, Message>()` factory record: every HTML/SVG/MathML
 * element constructor, every attribute and event member, and the
 * structural members (`list`/`cond`/`when`/`matchTag`/`submodel`/`empty`).
 * `derived` is deliberately absent - it stays the module-scope named
 * export it already is (`../reactive/derived.js`); `no-derived-in-view-bodies`
 * forbids the placement `h.derived` would advertise.
 */
export type HtmlFactory<Model, Message> = HtmlElements<Model, Message> &
  AttributeMembers<Model, Message> &
  ReturnType<typeof eventMembers<Model, Message>> &
  StructuralMembers<Model, Message>

const buildHtmlFactory = <Model, Message>(): HtmlFactory<Model, Message> => ({
  ...buildHtmlElements<Model, Message>(),
  ...attributeMembers<Model, Message>(),
  ...eventMembers<Model, Message>(),
  list: makeList<Model, Message>(),
  cond: makeCond<Model, Message>(),
  when: makeWhen<Model, Message>(),
  matchTag: makeMatchTag<Model, Message>(),
  submodel: makeSubmodel<Model, Message>(),
  empty: null,
})

const cachedHtmlFactory = buildHtmlFactory<unknown, unknown>()

/**
 * Returns all HTML, SVG, and MathML element constructors, attribute
 * members, event members, and structural members for authoring a view
 * against `Model`/`Message`. Call once per view module: `const h =
 * html<Model, Message>()`. The returned record is a single process-wide
 * singleton cast per instantiation (mirrors og's `html()`,
 * `packages/foldkit/src/html/index.ts:4979-4983) - every element/attribute/
 * event constructor closure is erased-generic at runtime (the type
 * parameters exist only to keep each view module's `Model`/`Message`
 * honest at the call site), so building the record once and reusing it
 * across every `html<Model, Message>()` call is safe and avoids
 * reallocating ~200 element constructors and every attribute/event member
 * per view.
 *
 * Attribute and structural-member values accept a static literal
 * (`h.Class('todo-list')`) or a `Bound<Model, A>` thunk (`h.Class(model =>
 * model.className)`). Static values are legal: under mount-once rendering,
 * static-vs-thunk IS the contract, not the ADR's rejected
 * eager-values-that-update-on-a-diffing-path alternative (that rejection
 * targeted a runtime that re-diffs an already-mounted tree; this one never
 * does). `no-eager-bind-reads` is the guard against a thunk that closes
 * over a frozen `Model` read.
 */
export const html = <Model, Message>(): HtmlFactory<Model, Message> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- process-wide singleton cast per instantiation, mirroring og html/index.ts:4979-4983; every constructor closure below is erased-generic at runtime, `Model`/`Message` exist only to keep each call site honest. */
  cachedHtmlFactory as unknown as HtmlFactory<Model, Message>
