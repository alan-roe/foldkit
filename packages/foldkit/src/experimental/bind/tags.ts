import type { AttrBinding, Binding, Bound } from './binding.js'
import { attr, el } from './binding.js'

// TAG CONSTRUCTORS

/** The shape every generated tag constructor has: same argument order as
 *  {@link el}, tag name baked in, both arguments optional (default to
 *  empty). */
type TagConstructor = <Model, Message>(
  attrs?: ReadonlyArray<AttrBinding<Model, Message>>,
  children?: ReadonlyArray<Binding<Model, Message>>,
) => Binding<Model, Message>

const makeTag =
  (tagName: string): TagConstructor =>
  (attrs = [], children = []) =>
    el(tagName, attrs, children)

/** `<div>` element binding. `el('div', attrs, children)` shorthand.
 *
 * @example
 * ```typescript
 * div([Class('app')], [text('hello')])
 * ```
 */
export const div: TagConstructor = makeTag('div')

/** `<span>` element binding. `el('span', attrs, children)` shorthand. */
export const span: TagConstructor = makeTag('span')

/** `<ul>` element binding. `el('ul', attrs, children)` shorthand. */
export const ul: TagConstructor = makeTag('ul')

/** `<ol>` element binding. `el('ol', attrs, children)` shorthand. */
export const ol: TagConstructor = makeTag('ol')

/** `<li>` element binding. `el('li', attrs, children)` shorthand. */
export const li: TagConstructor = makeTag('li')

/** `<button>` element binding. `el('button', attrs, children)` shorthand. */
export const button: TagConstructor = makeTag('button')

/** `<input>` element binding. `el('input', attrs, children)` shorthand. */
export const input: TagConstructor = makeTag('input')

/** `<label>` element binding. `el('label', attrs, children)` shorthand. */
export const label: TagConstructor = makeTag('label')

/** `<header>` element binding. `el('header', attrs, children)` shorthand. */
export const header: TagConstructor = makeTag('header')

/** `<footer>` element binding. `el('footer', attrs, children)` shorthand. */
export const footer: TagConstructor = makeTag('footer')

/** `<section>` element binding. `el('section', attrs, children)` shorthand. */
export const section: TagConstructor = makeTag('section')

/** `<article>` element binding. `el('article', attrs, children)` shorthand. */
export const article: TagConstructor = makeTag('article')

/** `<nav>` element binding. `el('nav', attrs, children)` shorthand. */
export const nav: TagConstructor = makeTag('nav')

/** `<main>` element binding. `el('main', attrs, children)` shorthand. */
export const main: TagConstructor = makeTag('main')

/** `<h1>` element binding. `el('h1', attrs, children)` shorthand. */
export const h1: TagConstructor = makeTag('h1')

/** `<h2>` element binding. `el('h2', attrs, children)` shorthand. */
export const h2: TagConstructor = makeTag('h2')

/** `<h3>` element binding. `el('h3', attrs, children)` shorthand. */
export const h3: TagConstructor = makeTag('h3')

/** `<a>` element binding. `el('a', attrs, children)` shorthand. */
export const a: TagConstructor = makeTag('a')

/** `<strong>` element binding. `el('strong', attrs, children)` shorthand. */
export const strong: TagConstructor = makeTag('strong')

/** `<em>` element binding. `el('em', attrs, children)` shorthand. */
export const em: TagConstructor = makeTag('em')

/** `<p>` element binding. `el('p', attrs, children)` shorthand. */
export const p: TagConstructor = makeTag('p')

/** `<form>` element binding. `el('form', attrs, children)` shorthand. */
export const form: TagConstructor = makeTag('form')

/** `<textarea>` element binding. `el('textarea', attrs, children)`
 *  shorthand. */
export const textarea: TagConstructor = makeTag('textarea')

/** `<select>` element binding. `el('select', attrs, children)` shorthand. */
export const select: TagConstructor = makeTag('select')

/** `<option>` element binding. `el('option', attrs, children)` shorthand. */
export const option: TagConstructor = makeTag('option')

/** `<table>` element binding. `el('table', attrs, children)` shorthand. */
export const table: TagConstructor = makeTag('table')

/** `<thead>` element binding. `el('thead', attrs, children)` shorthand. */
export const thead: TagConstructor = makeTag('thead')

/** `<tbody>` element binding. `el('tbody', attrs, children)` shorthand. */
export const tbody: TagConstructor = makeTag('tbody')

/** `<tr>` element binding. `el('tr', attrs, children)` shorthand. */
export const tr: TagConstructor = makeTag('tr')

/** `<td>` element binding. `el('td', attrs, children)` shorthand. */
export const td: TagConstructor = makeTag('td')

/** `<th>` element binding. `el('th', attrs, children)` shorthand. */
export const th: TagConstructor = makeTag('th')

// ATTRIBUTE CONVENIENCES
//
// Names and underlying HTML attribute keys mirror the `html` factory
// (packages/foldkit/src/html/index.ts) exactly: `Class`/`Id`/`Type`/
// `Value`/`Checked`/`Placeholder`/`For` there set the same attribute keys
// these set here ('class'/'id'/'type'/'value'/'checked'/'placeholder'/
// 'for').

/** `class` attribute convenience. `attr('class', value)` shorthand.
 *
 * @example
 * ```typescript
 * div([Class('app')], [])
 * ```
 */
export const Class = <Model, Message>(
  value: string | Bound<Model, string>,
): AttrBinding<Model, Message> => attr('class', value)

/** `id` attribute convenience. `attr('id', value)` shorthand. */
export const Id = <Model, Message>(
  value: string | Bound<Model, string>,
): AttrBinding<Model, Message> => attr('id', value)

/** `type` attribute convenience. `attr('type', value)` shorthand. */
export const Type = <Model, Message>(
  value: string | Bound<Model, string>,
): AttrBinding<Model, Message> => attr('type', value)

/** `checked` attribute convenience. `attr('checked', value)` shorthand. */
export const Checked = <Model, Message>(
  value: boolean | Bound<Model, boolean>,
): AttrBinding<Model, Message> => attr('checked', value)

/** `value` attribute convenience. `attr('value', value)` shorthand. */
export const Value = <Model, Message>(
  boundValue: string | Bound<Model, string>,
): AttrBinding<Model, Message> => attr('value', boundValue)

/** `placeholder` attribute convenience. `attr('placeholder', value)`
 *  shorthand. */
export const Placeholder = <Model, Message>(
  value: string | Bound<Model, string>,
): AttrBinding<Model, Message> => attr('placeholder', value)

/** `for` attribute convenience (the DOM property is `htmlFor`; the html
 *  factory names this same attribute `For`). `attr('for', value)`
 *  shorthand. */
export const For = <Model, Message>(
  value: string | Bound<Model, string>,
): AttrBinding<Model, Message> => attr('for', value)
