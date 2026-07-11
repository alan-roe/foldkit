import { describe, expect, test } from 'vitest'

import * as Bind from '../experimental/bind/public.js'
import * as Scene from './scene.js'

// FIXTURE: a small TodoMVC-ish bindView program (Binding tree, not Html).

type Todo = Readonly<{ id: string; title: string; isCompleted: boolean }>

type Model = Readonly<{
  todos: ReadonlyArray<Todo>
  filter: 'All' | 'Active'
}>

type Message =
  | Readonly<{ _tag: 'ToggledTodo'; id: string }>
  | Readonly<{ _tag: 'SetFilter'; filter: 'All' | 'Active' }>
  | Readonly<{ _tag: 'Reordered' }>

const toggledTodo = (id: string): Message => ({ _tag: 'ToggledTodo', id })
const setFilter = (filter: 'All' | 'Active'): Message => ({
  _tag: 'SetFilter',
  filter,
})
const reordered: Message = { _tag: 'Reordered' }

const initialModel: Model = {
  todos: [
    { id: '1', title: 'first', isCompleted: false },
    { id: '2', title: 'second', isCompleted: false },
  ],
  filter: 'All',
}

const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<never>] => {
  switch (message._tag) {
    case 'ToggledTodo':
      return [
        {
          ...model,
          todos: model.todos.map(todo =>
            todo.id === message.id
              ? { ...todo, isCompleted: !todo.isCompleted }
              : todo,
          ),
        },
        [],
      ]
    case 'SetFilter':
      return [{ ...model, filter: message.filter }, []]
    case 'Reordered':
      return [{ ...model, todos: [...model.todos].reverse() }, []]
  }
}

const visibleTodos = (model: Model): ReadonlyArray<Todo> =>
  model.filter === 'Active'
    ? model.todos.filter(todo => !todo.isCompleted)
    : model.todos

const view: Bind.Binding<Model, Message> = Bind.div(
  [Bind.Class('todoapp')],
  [
    Bind.matchTag<Model, Message>(model => model.filter, {
      All: () => Bind.text('Showing: All'),
      Active: () => Bind.text('Showing: Active'),
    }),
    Bind.ul(
      [Bind.attr('data-count', model => String(visibleTodos(model).length))],
      [
        Bind.list<Model, Message, Todo>(
          visibleTodos,
          todo => todo.id,
          readItem =>
            Bind.li(
              [
                Bind.attr('data-testid', () => `todo-${readItem().id}`),
                Bind.attr('class', () =>
                  readItem().isCompleted ? 'completed' : '',
                ),
                Bind.on('click', () => toggledTodo(readItem().id)),
              ],
              [Bind.text(() => readItem().title)],
            ),
        ),
      ],
    ),
    Bind.p(
      [Bind.attr('data-testid', 'done-count')],
      [
        Bind.text(
          model =>
            `${model.todos.filter(todo => todo.isCompleted).length} done`,
        ),
      ],
    ),
    Bind.button(
      [Bind.attr('data-testid', 'reorder'), Bind.on('click', () => reordered)],
      [Bind.text('Reorder')],
    ),
    Bind.button(
      [
        Bind.attr('data-testid', 'filter-active'),
        Bind.on('click', () => setFilter('Active')),
      ],
      [Bind.text('Active filter')],
    ),
  ],
)

// TESTS

describe('Scene with a bindView program (makeElement shape)', () => {
  test('a locator finds bound text after a with step', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('todo-1')).toHaveText('first'),
      Scene.expect(Scene.testId('todo-2')).toHaveText('second'),
    )
  })

  test('click dispatches through on(), and the next step sees the updated view', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('done-count')).toHaveText('0 done'),
      Scene.click(Scene.testId('todo-1')),
      Scene.expect(Scene.testId('done-count')).toHaveText('1 done'),
      Scene.expect(Scene.testId('todo-1')).toHaveClass('completed'),
    )
  })

  test('keyed list rows keep their identity across a reorder', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.first(Scene.all.selector('li'))).toHaveText('first'),
      Scene.click(Scene.testId('reorder')),
      // DOM order flipped ...
      Scene.expect(Scene.first(Scene.all.selector('li'))).toHaveText('second'),
      // ... but each row's `key` (from list()'s toKey) still resolves to the
      // same logical row, independent of position.
      Scene.expect(Scene.selector('[key="1"]')).toHaveText('first'),
      Scene.expect(Scene.selector('[key="2"]')).toHaveText('second'),
    )
  })

  test('a cond branch switches when the discriminant changes', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('Showing: All')).toExist(),
      Scene.expect(Scene.text('Showing: Active')).toBeAbsent(),
      Scene.click(Scene.testId('filter-active')),
      Scene.expect(Scene.text('Showing: Active')).toExist(),
      Scene.expect(Scene.text('Showing: All')).toBeAbsent(),
    )
  })

  test('toHaveHandler matches an on() listener', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('todo-1')).toHaveHandler('click'),
    )
  })

  test('toHaveHandler fails for an event with no on() listener', () => {
    expect(() =>
      Scene.scene(
        { update, bindView: view },
        Scene.with(initialModel),
        Scene.expect(Scene.testId('todo-1')).toHaveHandler('dblclick'),
      ),
    ).toThrow(/have handler "dblclick"/)
  })

  test('toHaveHook fails clearly: bindView has no hook lifecycle', () => {
    expect(() =>
      Scene.scene(
        { update, bindView: view },
        Scene.with(initialModel),
        Scene.expect(Scene.testId('todo-1')).toHaveHook('mount'),
      ),
    ).toThrow(/fine-grained \(bindView\) render path/)
  })

  test('the standalone sceneMatchers.toHaveHook gives the same bindView guidance', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.tap(({ html }) => {
        const element = Scene.testId('todo-1')(html)
        expect(() => expect(element).toHaveHook('mount')).toThrow(
          /fine-grained \(bindView\) render path/,
        )
      }),
    )
  })

  test('requires exactly one of view/bindView: throws when both are given', () => {
    expect(() =>
      Scene.scene(
        {
          update,
          view: () => Bind.div([], []) as never,
          bindView: view,
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        } as never,
        Scene.with(initialModel),
      ),
    ).toThrow(/exactly one of `view` or `bindView`/)
  })

  test('requires exactly one of view/bindView: throws when neither is given', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      Scene.scene({ update } as never, Scene.with(initialModel)),
    ).toThrow(/exactly one of `view` or `bindView`/)
  })
})

describe('Scene with a bindView program (makeApplication shape)', () => {
  test('renders `body` and ignores `title`', () => {
    Scene.scene(
      {
        update,
        bindView: { title: 'My Todos', body: view },
      },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('todo-1')).toHaveText('first'),
      Scene.click(Scene.testId('todo-1')),
      Scene.expect(Scene.testId('done-count')).toHaveText('1 done'),
    )
  })
})
