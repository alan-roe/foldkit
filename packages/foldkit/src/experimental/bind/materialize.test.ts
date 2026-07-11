import { describe, expect, it } from 'vitest'

import { attr, cond, el, list, on, text } from './binding.js'
import { type MaterializedNode, materialize } from './materialize.js'

// FIXTURES

type Todo = Readonly<{ id: string; title: string; isCompleted: boolean }>

type Model = Readonly<{
  headerText: string
  todos: ReadonlyArray<Todo>
  filter: 'All' | 'Active'
}>

type Message = Readonly<{ _tag: 'ToggledTodo'; id: string }>

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  headerText: 'todos',
  todos: [
    { id: '1', title: 'first', isCompleted: false },
    { id: '2', title: 'second', isCompleted: true },
    { id: '3', title: 'third', isCompleted: false },
  ],
  filter: 'All',
  ...overrides,
})

const toggledTodo = (id: string): Message => ({ _tag: 'ToggledTodo', id })

const view = el<Model, Message>(
  'div',
  [attr('class', 'app')],
  [
    el('h1', [], [text(model => model.headerText)]),
    el(
      'ul',
      [attr('data-count', model => String(model.todos.length))],
      [
        list<Model, Message, Todo>(
          model => model.todos,
          todo => todo.id,
          readItem =>
            el(
              'li',
              [
                attr('class', () => (readItem().isCompleted ? 'done' : 'open')),
                on('click', () => toggledTodo(readItem().id)),
              ],
              [text(() => readItem().title)],
            ),
        ),
      ],
    ),
    cond<Model, Message>(
      model => model.filter,
      key =>
        key === 'Active'
          ? text('showing active only')
          : text('showing all todos'),
    ),
  ],
)

describe('materialize', () => {
  it('materializes bound text, bound + static attrs, a keyed list, and a cond branch', () => {
    const model = makeModel()

    const result = materialize(view, model)

    expect(result).toStrictEqual({
      _tag: 'MaterializedElement',
      tag: 'div',
      attrs: { class: 'app' },
      handlers: {},
      children: [
        {
          _tag: 'MaterializedElement',
          tag: 'h1',
          attrs: {},
          handlers: {},
          children: [{ _tag: 'MaterializedText', text: 'todos' }],
        },
        {
          _tag: 'MaterializedElement',
          tag: 'ul',
          attrs: { 'data-count': '3' },
          handlers: {},
          children: [
            {
              _tag: 'MaterializedElement',
              tag: 'li',
              attrs: { class: 'open' },
              handlers: { click: expect.any(Function) },
              children: [{ _tag: 'MaterializedText', text: 'first' }],
            },
            {
              _tag: 'MaterializedElement',
              tag: 'li',
              attrs: { class: 'done' },
              handlers: { click: expect.any(Function) },
              children: [{ _tag: 'MaterializedText', text: 'second' }],
            },
            {
              _tag: 'MaterializedElement',
              tag: 'li',
              attrs: { class: 'open' },
              handlers: { click: expect.any(Function) },
              children: [{ _tag: 'MaterializedText', text: 'third' }],
            },
          ],
        },
        { _tag: 'MaterializedText', text: 'showing all todos' },
      ],
    } satisfies MaterializedNode)
  })

  it('collects On handlers that dispatch the closed-over Message', () => {
    const model = makeModel()

    const result = materialize(view, model)

    if (result._tag !== 'MaterializedElement') {
      throw new Error('expected a MaterializedElement')
    }
    const list = result.children[1]
    if (list === undefined || list._tag !== 'MaterializedElement') {
      throw new Error('expected the list element')
    }
    const firstRow = list.children[0]
    if (firstRow === undefined || firstRow._tag !== 'MaterializedElement') {
      throw new Error('expected the first row element')
    }

    expect(firstRow.handlers['click']?.(new Event('click'))).toStrictEqual(
      toggledTodo('1'),
    )
  })

  it('re-materializes to reflect a changed model value', () => {
    const before = materialize(view, makeModel({ headerText: 'todos' }))
    const after = materialize(
      view,
      makeModel({ headerText: 'my todos', filter: 'Active' }),
    )

    expect(
      before._tag === 'MaterializedElement' && before.children[0],
    ).toStrictEqual({
      _tag: 'MaterializedElement',
      tag: 'h1',
      attrs: {},
      handlers: {},
      children: [{ _tag: 'MaterializedText', text: 'todos' }],
    })
    expect(
      after._tag === 'MaterializedElement' && after.children[0],
    ).toStrictEqual({
      _tag: 'MaterializedElement',
      tag: 'h1',
      attrs: {},
      handlers: {},
      children: [{ _tag: 'MaterializedText', text: 'my todos' }],
    })
    expect(
      after._tag === 'MaterializedElement' && after.children[2],
    ).toStrictEqual({ _tag: 'MaterializedText', text: 'showing active only' })
  })

  it('expands an empty list selection into zero children', () => {
    const model = makeModel({ todos: [] })

    const result = materialize(view, model)

    if (result._tag !== 'MaterializedElement') {
      throw new Error('expected a MaterializedElement')
    }
    const listNode = result.children[1]
    if (listNode === undefined || listNode._tag !== 'MaterializedElement') {
      throw new Error('expected the list element')
    }
    expect(listNode.children).toStrictEqual([])
  })

  it('is pure: repeated materialization of the same model yields structurally equal trees', () => {
    const model = makeModel()
    const dropHandlers = (value: unknown): unknown =>
      typeof value === 'function' ? '[function]' : value

    const first = materialize(view, model)
    const second = materialize(view, model)

    expect(JSON.stringify(first, (_key, v) => dropHandlers(v))).toBe(
      JSON.stringify(second, (_key, v) => dropHandlers(v)),
    )
  })

  it('does not mutate the binding tree', () => {
    const before = JSON.stringify(view, (_key, value) =>
      typeof value === 'function' ? '[function]' : value,
    )

    materialize(view, makeModel())

    const after = JSON.stringify(view, (_key, value) =>
      typeof value === 'function' ? '[function]' : value,
    )
    expect(after).toBe(before)
  })
})
