import { Array, Match as M, Schema as S } from 'effect'

import * as Command from '../../../command/index.js'
import { m } from '../../../message/index.js'
import { evo } from '../../../struct/index.js'

// MODEL

/** A single TodoMVC row. */
export const Todo = S.Struct({
  id: S.String,
  title: S.String,
  isCompleted: S.Boolean,
})
export type Todo = typeof Todo.Type

/** Which subset of `todos` the footer's `cond()` branch renders. */
export const Filter = S.Literals(['All', 'Active', 'Completed'])
export type Filter = typeof Filter.Type

export const Model = S.Struct({
  todos: S.Array(Todo),
  filter: Filter,
  headerText: S.String,
})
export type Model = typeof Model.Type

// MESSAGE

export const AddedTodos = m('AddedTodos', { count: S.Number })
export const ToggledTodo = m('ToggledTodo', { id: S.String })
export const RetitledTodo = m('RetitledTodo', { id: S.String, title: S.String })
export const ReversedTodos = m('ReversedTodos')
export const ClearedTodos = m('ClearedTodos')
export const UpdatedHeaderText = m('UpdatedHeaderText', { text: S.String })

export const Message = S.Union([
  AddedTodos,
  ToggledTodo,
  RetitledTodo,
  ReversedTodos,
  ClearedTodos,
  UpdatedHeaderText,
])
export type Message = typeof Message.Type

// INIT

/** Deterministic, index-seeded todo generation: no randomness, so bench runs
 *  and tests are reproducible. Every third todo starts completed. */
export const generateTodo = (index: number): Todo => ({
  id: `todo-${index}`,
  title: `Todo item ${index}`,
  isCompleted: index % 3 === 0,
})

/** Generates `count` deterministic todos, continuing the id/title sequence
 *  from `startIndex` so repeated calls (e.g. `AddedTodos` appended to an
 *  existing list) never collide with earlier ids. */
export const generateTodos = (
  count: number,
  startIndex = 0,
): ReadonlyArray<Todo> =>
  Array.makeBy(count, offset => generateTodo(startIndex + offset))

export const initialModel: Model = {
  todos: [],
  filter: 'All',
  headerText: 'todos',
}

/** Builds a Model seeded with `count` deterministic todos, for bench
 *  scenarios and tests that need a specific tree size. */
export const makeModelWithTodos = (count: number): Model =>
  evo(initialModel, { todos: () => generateTodos(count) })

// UPDATE

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      AddedTodos: ({ count }) => [
        evo(model, {
          todos: todos => [
            ...todos,
            ...generateTodos(count, Array.length(todos)),
          ],
        }),
        [],
      ],
      ToggledTodo: ({ id }) => [
        evo(model, {
          todos: todos =>
            Array.map(todos, todo =>
              todo.id === id
                ? evo(todo, { isCompleted: isCompleted => !isCompleted })
                : todo,
            ),
        }),
        [],
      ],
      RetitledTodo: ({ id, title }) => [
        evo(model, {
          todos: todos =>
            Array.map(todos, todo =>
              todo.id === id ? evo(todo, { title: () => title }) : todo,
            ),
        }),
        [],
      ],
      ReversedTodos: () => [
        evo(model, { todos: todos => Array.reverse(todos) }),
        [],
      ],
      ClearedTodos: () => [evo(model, { todos: () => [] }), []],
      UpdatedHeaderText: ({ text }) => [
        evo(model, { headerText: () => text }),
        [],
      ],
    }),
  )
