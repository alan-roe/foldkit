import { Match as M } from 'effect'

import {
  type Binding,
  attr,
  cond,
  el,
  list,
  on,
  text,
} from '../../../experimental/bind/binding.js'
import { type Message, type Model, type Todo, ToggledTodo } from './app.js'

// VIEW

const filterLabel = (filter: string): string =>
  M.value(filter).pipe(
    M.when('All', () => 'Showing all'),
    M.when('Active', () => 'Showing active'),
    M.when('Completed', () => 'Showing completed'),
    M.orElse(() => 'Showing all'),
  )

const renderTodoRow = (readTodo: () => Todo): Binding<Model, Message> =>
  el<Model, Message>(
    'li',
    [
      attr<Model, Message>('class', () =>
        readTodo().isCompleted ? 'completed' : '',
      ),
    ],
    [
      el<Model, Message>(
        'div',
        [attr<Model, Message>('class', 'view')],
        [
          el<Model, Message>(
            'input',
            [
              attr<Model, Message>('class', 'toggle'),
              attr<Model, Message>('type', 'checkbox'),
              attr<Model, Message>('checked', () => readTodo().isCompleted),
              on<Model, Message>('click', () =>
                ToggledTodo({ id: readTodo().id }),
              ),
            ],
            [],
          ),
          el<Model, Message>(
            'label',
            [],
            [text<Model, Message>(() => readTodo().title)],
          ),
        ],
      ),
    ],
  )

const renderFilterBranch = (filter: string): Binding<Model, Message> =>
  el<Model, Message>(
    'footer',
    [attr<Model, Message>('class', 'footer')],
    [
      el<Model, Message>(
        'span',
        [attr<Model, Message>('class', 'filter-label')],
        [text<Model, Message>(filterLabel(filter))],
      ),
    ],
  )

/**
 * The same TodoMVC-shaped markup as {@link ../viewSnabbdom!view}, described
 * as a `binding.ts` tree rather than built via the `html` factory. Header
 * text and the footer filter label are bound to `Model`; the row list is
 * keyed by todo id, with per-row bindings on `isCompleted` (class) and
 * `title` (text) scoped to that row's `readTodo` thunk.
 */
export const view = (): Binding<Model, Message> =>
  el<Model, Message>(
    'section',
    [attr<Model, Message>('class', 'todoapp')],
    [
      el<Model, Message>(
        'header',
        [attr<Model, Message>('class', 'header')],
        [
          el<Model, Message>(
            'h1',
            [],
            [text<Model, Message>(model => model.headerText)],
          ),
        ],
      ),
      el<Model, Message>(
        'section',
        [attr<Model, Message>('class', 'main')],
        [
          el<Model, Message>(
            'ul',
            [attr<Model, Message>('class', 'todo-list')],
            [
              list<Model, Message, Todo>(
                model => model.todos,
                todo => todo.id,
                renderTodoRow,
              ),
            ],
          ),
        ],
      ),
      cond<Model, Message>(model => model.filter, renderFilterBranch),
    ],
  )
