import { Match as M } from 'effect'

import { type Binding } from '../../../experimental/bind/binding.js'
import { html } from '../../../experimental/index.js'
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

const renderRow = (readTodo: () => Todo): Binding<Model, Message> => {
  const h = html<Model, Message>()

  return h.li(
    [h.Class(() => (readTodo().isCompleted ? 'completed' : ''))],
    [
      h.div(
        [h.Class('view')],
        [
          h.input([
            h.Class('toggle'),
            h.Type('checkbox'),
            h.Checked(() => readTodo().isCompleted),
            // NOTE: `readTodo().id` is deliberately read at row construction,
            // not through the thunk overload: `id` is this row's `list` key,
            // stable for the row's lifetime (a changed `id` mounts a new row).
            // Mutable fields (`isCompleted`, `title`) stay thunked.
            h.OnClick(ToggledTodo({ id: readTodo().id })),
          ]),
          h.label([], [() => readTodo().title]),
        ],
      ),
    ],
  )
}

/**
 * The same TodoMVC-shaped markup as {@link ../viewSnabbdom!view}, described
 * as `Binding` data through `html<Model, Message>()` instead of built as a
 * fresh vnode tree on every render: the view is constructed once, and
 * dynamic positions (row fields, the header text, the filter label) are
 * thunks re-read by the fine-grained renderer instead of re-evaluated here.
 */
export const view = (): Binding<Model, Message> => {
  const h = html<Model, Message>()

  const header = h.header(
    [h.Class('header')],
    [h.h1([], [model => model.headerText])],
  )

  const main = h.section(
    [h.Class('main')],
    [
      h.ul(
        [h.Class('todo-list')],
        [
          h.list(
            model => model.todos,
            todo => todo.id,
            renderRow,
          ),
        ],
      ),
    ],
  )

  const footer = h.footer(
    [h.Class('footer')],
    [h.span([h.Class('filter-label')], [model => filterLabel(model.filter)])],
  )

  return h.section([h.Class('todoapp')], [header, main, footer])
}
