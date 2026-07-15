import { Stream } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  type AttrBinding,
  type Binding,
  type Bound,
  attr,
  cond,
  el,
  list,
  on,
  onMount,
  onUnmount,
  text,
} from './binding.js'

// FIXTURES

type Todo = Readonly<{ id: string; title: string; isCompleted: boolean }>

type Model = Readonly<{
  headerText: string
  todos: ReadonlyArray<Todo>
  filter: string
}>

type Message =
  | Readonly<{ _tag: 'ToggledTodo'; id: string }>
  | Readonly<{ _tag: 'ClearedTodos' }>

describe('el', () => {
  it('produces a tagged El with the given tag, attrs, and children', () => {
    const attrs: ReadonlyArray<AttrBinding<Model, Message>> = [
      attr('class', 'todo-list'),
    ]
    const children: ReadonlyArray<Binding<Model, Message>> = [text('hello')]

    const binding = el<Model, Message>('ul', attrs, children)

    expect(binding).toStrictEqual({
      _tag: 'El',
      tag: 'ul',
      attrs,
      children,
    })
  })
})

describe('text', () => {
  it('wraps a static string literal', () => {
    const binding = text<Model, Message>('todos')

    expect(binding).toStrictEqual({ _tag: 'Text', value: 'todos' })
  })

  it('wraps a Bound thunk reading the model', () => {
    const readHeaderText: Bound<Model, string> = m => m.headerText

    const binding = text<Model, Message>(readHeaderText)

    expect(binding).toStrictEqual({ _tag: 'Text', value: readHeaderText })
    expect(binding._tag === 'Text' && binding.value === readHeaderText).toBe(
      true,
    )
  })
})

describe('attr', () => {
  it('wraps a static string value', () => {
    const binding = attr<Model, Message>('type', 'checkbox')

    expect(binding).toStrictEqual({
      _tag: 'Attr',
      name: 'type',
      value: 'checkbox',
    })
  })

  it('wraps a static boolean value', () => {
    const binding = attr<Model, Message>('disabled', true)

    expect(binding).toStrictEqual({
      _tag: 'Attr',
      name: 'disabled',
      value: true,
    })
  })

  it('wraps a Bound thunk producing a string or boolean', () => {
    const readIsCompleted: Bound<Model, boolean> = m =>
      m.todos.some(todo => todo.isCompleted)

    const binding = attr<Model, Message>('data-completed', readIsCompleted)

    expect(binding).toStrictEqual({
      _tag: 'Attr',
      name: 'data-completed',
      value: readIsCompleted,
    })
  })
})

describe('on', () => {
  it('wraps an event name and a toMessage callback closing over stable data', () => {
    const toMessage = (_event: Event): Message => ({
      _tag: 'ToggledTodo',
      id: '1',
    })

    const binding = on<Model, Message>('click', toMessage)

    expect(binding).toStrictEqual({
      _tag: 'On',
      event: 'click',
      toMessage,
    })
  })
})

describe('onMount', () => {
  it('wraps a MountAction under the Mount tag', () => {
    const action = {
      name: 'Measure',
      f: () => Stream.succeed({ _tag: 'ClearedTodos' as const }),
    }

    const binding = onMount<Model, Message>(action)

    expect(binding).toStrictEqual({ _tag: 'Mount', action })
  })
})

describe('onUnmount', () => {
  it('wraps a Message under the Unmount tag', () => {
    const message: Message = { _tag: 'ClearedTodos' }

    const binding = onUnmount<Model, Message>(message)

    expect(binding).toStrictEqual({ _tag: 'Unmount', message })
  })
})

describe('list', () => {
  it('captures select, toKey, and renderItem', () => {
    const select: Bound<Model, ReadonlyArray<Todo>> = m => m.todos
    const toKey = (todo: Todo) => todo.id
    const renderItem = (readItem: () => Todo): Binding<Model, Message> =>
      text<Model, Message>(() => readItem().title)

    const binding = list<Model, Message, Todo>(select, toKey, renderItem)

    expect(binding).toStrictEqual({
      _tag: 'List',
      select,
      toKey,
      renderItem,
    })
  })
})

describe('cond', () => {
  it('captures the discriminant and renderBranch', () => {
    const discriminant: Bound<Model, string> = m => m.filter
    const renderBranch = (key: string): Binding<Model, Message> => text(key)

    const binding = cond<Model, Message>(discriminant, renderBranch)

    expect(binding).toStrictEqual({
      _tag: 'Cond',
      discriminant,
      renderBranch,
    })
  })
})

// TYPE-LEVEL CHECKS

describe('type-level: Bound thunk positions', () => {
  it('text accepts a static literal or a (model) => string thunk', () => {
    expectTypeOf(text<Model, Message>)
      .parameter(0)
      .toEqualTypeOf<string | Bound<Model, string>>()

    text<Model, Message>('static')
    text<Model, Message>(m => m.headerText)
  })

  it('attr accepts a static literal or a (model) => string | boolean thunk', () => {
    expectTypeOf(attr<Model, Message>)
      .parameter(1)
      .toEqualTypeOf<string | boolean | Bound<Model, string | boolean>>()

    attr<Model, Message>('class', 'static')
    attr<Model, Message>('disabled', true)
    attr<Model, Message>('class', m => m.filter)
  })

  it('list.select is a (model) => ReadonlyArray<Item> thunk, never a static array', () => {
    expectTypeOf(list<Model, Message, Todo>)
      .parameter(0)
      .toEqualTypeOf<Bound<Model, ReadonlyArray<Todo>>>()
  })

  it('list.renderItem receives a () => Item thunk, not the item itself', () => {
    expectTypeOf(list<Model, Message, Todo>)
      .parameter(2)
      .toEqualTypeOf<(readItem: () => Todo) => Binding<Model, Message>>()
  })

  it('cond.discriminant is a (model) => string thunk', () => {
    expectTypeOf(cond<Model, Message>)
      .parameter(0)
      .toEqualTypeOf<Bound<Model, string>>()
  })

  it('constructors return Binding<Model, Message>', () => {
    expectTypeOf(el<Model, Message>).returns.toEqualTypeOf<
      Binding<Model, Message>
    >()
    expectTypeOf(text<Model, Message>).returns.toEqualTypeOf<
      Binding<Model, Message>
    >()
    expectTypeOf(list<Model, Message, Todo>).returns.toEqualTypeOf<
      Binding<Model, Message>
    >()
    expectTypeOf(cond<Model, Message>).returns.toEqualTypeOf<
      Binding<Model, Message>
    >()
  })
})
