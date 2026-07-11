import { describe, expect, it } from 'vitest'

import { attr, el, on, text } from './binding.js'
import {
  Checked,
  Class,
  For,
  Id,
  Placeholder,
  Type,
  Value,
  button,
  div,
  input,
  label,
} from './tags.js'

type Model = Readonly<{ title: string }>
type Message = Readonly<{ _tag: 'Clicked' }>

describe('tag constructors', () => {
  it('div(attrs, children) produces the same Binding as el("div", attrs, children)', () => {
    const attrs = [attr<Model, Message>('class', 'app')]
    const children = [text<Model, Message>('hello')]

    expect(div<Model, Message>(attrs, children)).toStrictEqual(
      el<Model, Message>('div', attrs, children),
    )
  })

  it('defaults attrs and children to empty arrays', () => {
    expect(div<Model, Message>()).toStrictEqual(
      el<Model, Message>('div', [], []),
    )
  })

  it('button(attrs, children) produces the same Binding as el("button", attrs, children)', () => {
    const attrs = [on<Model, Message>('click', () => ({ _tag: 'Clicked' }))]
    const children = [text<Model, Message>('Save')]

    expect(button<Model, Message>(attrs, children)).toStrictEqual(
      el<Model, Message>('button', attrs, children),
    )
  })

  it('input(attrs, children) produces the same Binding as el("input", attrs, children)', () => {
    expect(input<Model, Message>([], [])).toStrictEqual(
      el<Model, Message>('input', [], []),
    )
  })

  it('label(attrs, children) produces the same Binding as el("label", attrs, children)', () => {
    expect(label<Model, Message>([], [])).toStrictEqual(
      el<Model, Message>('label', [], []),
    )
  })
})

describe('attribute conveniences', () => {
  it('Class produces the same AttrBinding as attr("class", value)', () => {
    expect(Class<Model, Message>('app')).toStrictEqual(
      attr<Model, Message>('class', 'app'),
    )
  })

  it('Id produces the same AttrBinding as attr("id", value)', () => {
    expect(Id<Model, Message>('app-root')).toStrictEqual(
      attr<Model, Message>('id', 'app-root'),
    )
  })

  it('Type produces the same AttrBinding as attr("type", value)', () => {
    expect(Type<Model, Message>('checkbox')).toStrictEqual(
      attr<Model, Message>('type', 'checkbox'),
    )
  })

  it('Checked produces the same AttrBinding as attr("checked", value)', () => {
    expect(Checked<Model, Message>(true)).toStrictEqual(
      attr<Model, Message>('checked', true),
    )
  })

  it('Value produces the same AttrBinding as attr("value", value)', () => {
    expect(Value<Model, Message>('42')).toStrictEqual(
      attr<Model, Message>('value', '42'),
    )
  })

  it('Placeholder produces the same AttrBinding as attr("placeholder", value)', () => {
    expect(Placeholder<Model, Message>('search')).toStrictEqual(
      attr<Model, Message>('placeholder', 'search'),
    )
  })

  it('For produces the same AttrBinding as attr("for", value)', () => {
    expect(For<Model, Message>('email-input')).toStrictEqual(
      attr<Model, Message>('for', 'email-input'),
    )
  })

  it('accepts a Bound thunk, matching attr()', () => {
    const boundClass = (model: Model) => model.title
    expect(Class<Model, Message>(boundClass)).toStrictEqual(
      attr<Model, Message>('class', boundClass),
    )
  })
})
