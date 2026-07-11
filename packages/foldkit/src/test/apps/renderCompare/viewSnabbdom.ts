import { Array, Match as M } from 'effect'

import { type Document, html } from '../../../html/index.js'
import {
  type Filter,
  type Message,
  type Model,
  type Todo,
  ToggledTodo,
} from './app.js'

// VIEW

const filterLabel = (filter: Filter): string =>
  M.value(filter).pipe(
    M.when('All', () => 'Showing all'),
    M.when('Active', () => 'Showing active'),
    M.when('Completed', () => 'Showing completed'),
    M.exhaustive,
  )

const todoRow = (todo: Todo): Document['body'] => {
  const h = html<Message>()

  return h.keyed('li')(
    todo.id,
    [h.Class(todo.isCompleted ? 'completed' : '')],
    [
      h.div(
        [h.Class('view')],
        [
          h.input([
            h.Class('toggle'),
            h.Type('checkbox'),
            h.Checked(todo.isCompleted),
            h.OnClick(ToggledTodo({ id: todo.id })),
          ]),
          h.label([], [todo.title]),
        ],
      ),
    ],
  )
}

/**
 * Naive baseline view: rebuilds the whole tree on every render with no
 * `createLazy`/`createKeyedLazy` memoization. This is the honest comparison
 * point for the fine-grained renderer, not an optimised snabbdom view.
 */
export const view = (model: Model): Document => {
  const h = html<Message>()

  const header = h.header([h.Class('header')], [h.h1([], [model.headerText])])

  const main = h.section(
    [h.Class('main')],
    [h.ul([h.Class('todo-list')], Array.map(model.todos, todoRow))],
  )

  const footer = h.footer(
    [h.Class('footer')],
    [h.span([h.Class('filter-label')], [filterLabel(model.filter)])],
  )

  return {
    title: model.headerText,
    body: h.section([h.Class('todoapp')], [header, main, footer]),
  }
}
