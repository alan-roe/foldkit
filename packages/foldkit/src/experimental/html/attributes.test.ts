import { describe, expect, it } from 'vitest'

import { html as ogHtml } from '../../html/index.js'
import { el } from '../bind/binding.js'
import { materialize } from '../bind/materialize.js'
import type { MaterializedElement } from '../bind/materialize.js'
import { attributeMembers } from './attributes.js'

// FIXTURES

type Model = Readonly<{
  className: string
  count: number
  isOpen: boolean
  color: string
}>

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  className: 'todo-list',
  count: 3,
  isOpen: true,
  color: 'crimson',
  ...overrides,
})

type Message = Readonly<{ _tag: 'Noop' }>

const asElement = (
  node: MaterializedElement | ReturnType<typeof materialize>,
): MaterializedElement => {
  if (node._tag !== 'MaterializedElement') {
    throw new Error('expected a MaterializedElement')
  }
  return node
}

// EXHAUSTIVENESS INVENTORY
//
// Computed from real sources, not literals: the og runtime factory's own
// key set (`packages/foldkit/src/html/index.ts`'s exported `html()`),
// filtered down to the same "non-event, non-`Key`" criterion the contract
// specifies, minus this file's one documented exclusion (`AllowDrop`,
// which ships from `events.ts` - see `attributes.ts`'s header comment).
// `Prop` is intentionally absent from both sides: og's own `html()`
// factory never exposes it either (only a raw `Attribute` enum case,
// consumed internally by `customElement/index.ts`), so it stays out of
// this member set on both the og and the shipped side.

describe('exhaustiveness: every non-event, non-Key og member is covered', () => {
  it('member set matches og minus Key/On*/AllowDrop', () => {
    const og = ogHtml<Message>()
    const ogNonEventMemberNames = Object.keys(og).filter(
      name => /^[A-Z]/.test(name) && name !== 'Key' && !name.startsWith('On'),
    )
    const excludedFromOg = ['AllowDrop']
    const expectedNames = ogNonEventMemberNames.filter(
      name => !excludedFromOg.includes(name),
    )

    const members = attributeMembers<Model, Message>()
    const memberNames = Object.keys(members)

    expect(memberNames.length).toBe(expectedNames.length)
    expect(new Set(memberNames)).toEqual(new Set(expectedNames))
  })
})

// STRING-VALUED FAMILY

describe('string-valued attributes', () => {
  it('static value materializes to the literal attribute value', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>('div', [h.Class('todo-list')], [])
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ class: 'todo-list' })
  })

  it('Bound value re-reads the model at materialize time', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.Class(model => model.className)],
      [],
    )
    const node = asElement(
      materialize(binding, makeModel({ className: 'active' })),
    )
    expect(node.attrs).toEqual({ class: 'active' })
  })

  it('preserves the og attribute-name mapping for renamed members', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'label',
      [h.For('email'), h.FormAttr('signup'), h.CiteAttr('https://example.com')],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({
      for: 'email',
      form: 'signup',
      cite: 'https://example.com',
    })
  })
})

// NUMERIC FAMILY

describe('numeric attributes', () => {
  it('static number coerces to its string attribute value', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>('div', [h.Tabindex(0)], [])
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ tabindex: '0' })
  })

  it('Bound number re-reads the model and coerces to string', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'td',
      [h.Colspan(model => model.count)],
      [],
    )
    const node = asElement(materialize(binding, makeModel({ count: 4 })))
    expect(node.attrs).toEqual({ colspan: '4' })
  })
})

// NATIVE BOOLEAN FAMILY (presence/absence)

describe('native boolean attributes', () => {
  it('static true/false materialize as literal boolean attr values', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'button',
      [h.Disabled(true), h.Autofocus(false)],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ disabled: true, autofocus: false })
  })

  it('Bound boolean re-reads the model', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'button',
      [h.Disabled(model => !model.isOpen)],
      [],
    )
    const node = asElement(materialize(binding, makeModel({ isOpen: false })))
    expect(node.attrs).toEqual({ disabled: true })
  })
})

// LIVE DOM-STATE FAMILY (Value/Checked/Selected/Open/Muted - property
// writes via the IR's prop(), mirroring og's updatePropsWithPostpatch set:
// after a user interaction sets the dirty flag, setAttribute no longer
// reflects into the property)

describe('live DOM-state members', () => {
  it('static values land in props, not attrs', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'input',
      [h.Value('draft'), h.Checked(true)],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.props).toEqual({ value: 'draft', checked: true })
    expect(node.attrs).toEqual({})
  })

  it('Bound values re-read the model into props', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'details',
      [h.Open(model => model.isOpen), h.Muted(false), h.Selected(false)],
      [],
    )
    const node = asElement(materialize(binding, makeModel({ isOpen: true })))
    expect(node.props).toEqual({ open: true, muted: false, selected: false })
  })
})

// ENUMERATED-STRING BOOLEAN FAMILY (og stringifies rather than toggling
// presence - draggable/spellcheck are enumerated content attributes)

describe('enumerated-string boolean attributes (Draggable, Spellcheck)', () => {
  it('stringifies true/false instead of toggling attribute presence', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.Draggable(true), h.Spellcheck(false)],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ draggable: 'true', spellcheck: 'false' })
  })

  it('Bound form stringifies the re-read model value', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.Draggable(model => model.isOpen)],
      [],
    )
    const node = asElement(materialize(binding, makeModel({ isOpen: true })))
    expect(node.attrs).toEqual({ draggable: 'true' })
  })
})

// ARIA FAMILY: string, boolean (always-present string), numeric, and the
// boolean | 'mixed' union all live under aria-*

describe('aria attributes', () => {
  it('aria string members pass through unchanged', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>('div', [h.AriaLabel('Close dialog')], [])
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ 'aria-label': 'Close dialog' })
  })

  it('aria boolean members stringify true/false, always present', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.AriaHidden(true), h.AriaExpanded(false)],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({
      'aria-hidden': 'true',
      'aria-expanded': 'false',
    })
  })

  it('aria numeric members coerce to string', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>('div', [h.AriaLevel(2)], [])
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ 'aria-level': '2' })
  })

  it('AriaChecked accepts boolean or the "mixed" literal', () => {
    const h = attributeMembers<Model, Message>()
    const mixed = asElement(
      materialize(
        el<Model, Message>('div', [h.AriaChecked('mixed')], []),
        makeModel(),
      ),
    )
    const checked = asElement(
      materialize(
        el<Model, Message>('div', [h.AriaChecked(true)], []),
        makeModel(),
      ),
    )
    expect(mixed.attrs).toEqual({ 'aria-checked': 'mixed' })
    expect(checked.attrs).toEqual({ 'aria-checked': 'true' })
  })
})

// CUSTOM / DATA-* FAMILY

describe('custom and data-* escape hatches', () => {
  it('Attribute writes the runtime key unchanged', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.Attribute('data-testid', 'todo-item')],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ 'data-testid': 'todo-item' })
  })

  it('DataAttribute prefixes the runtime key with data-', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>('div', [h.DataAttribute('id', '42')], [])
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ 'data-id': '42' })
  })

  it('Bound value form re-reads the model for both', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.DataAttribute('count', model => String(model.count))],
      [],
    )
    const node = asElement(materialize(binding, makeModel({ count: 7 })))
    expect(node.attrs).toEqual({ 'data-count': '7' })
  })
})

// STYLE FAMILY

describe('Style', () => {
  it('serializes a record to inline style text, camelCase converted to kebab', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.Style({ backgroundColor: 'red', 'flex-direction': 'column' })],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({
      style: 'background-color:red;flex-direction:column',
    })
  })

  it('Bound style record re-reads the model', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.Style(model => ({ color: model.color }))],
      [],
    )
    const node = asElement(materialize(binding, makeModel({ color: 'blue' })))
    expect(node.attrs).toEqual({ style: 'color:blue' })
  })
})

// SVG FAMILY (kebab and camelCase content-attribute casing both appear)

describe('SVG/MathML presentation attributes', () => {
  it('preserves the og camelCase names for SVG attributes that require it', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'svg',
      [h.ViewBox('0 0 100 100'), h.PreserveAspectRatio('xMidYMid meet')],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({
      viewBox: '0 0 100 100',
      preserveAspectRatio: 'xMidYMid meet',
    })
  })

  it('preserves the og kebab-case names for SVG attributes that require it', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'path',
      [h.StrokeWidth('2'), h.FillRule('evenodd')],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.attrs).toEqual({ 'stroke-width': '2', 'fill-rule': 'evenodd' })
  })
})

// DOM-PROPERTY FAMILY (InnerHTML - `Prop` itself stays internal to
// `attributes.ts`, since og's own `html()` factory never exposes it either)

describe('InnerHTML', () => {
  it('writes the innerHTML property, not a setAttribute call', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.InnerHTML('<strong>bold</strong>')],
      [],
    )
    const node = asElement(materialize(binding, makeModel()))
    expect(node.props).toEqual({ innerHTML: '<strong>bold</strong>' })
    expect(node.attrs).toEqual({})
  })

  it('Bound value re-reads the model at materialize time', () => {
    const h = attributeMembers<Model, Message>()
    const binding = el<Model, Message>(
      'div',
      [h.InnerHTML(model => `<em>${model.className}</em>`)],
      [],
    )
    const node = asElement(
      materialize(binding, makeModel({ className: 'active' })),
    )
    expect(node.props).toEqual({ innerHTML: '<em>active</em>' })
  })
})
