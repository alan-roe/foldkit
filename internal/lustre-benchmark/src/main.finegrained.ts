import { Array } from 'effect'
import {
  type Binding,
  attr,
  cond,
  el,
  list,
  on,
  text,
} from 'foldkit/experimental/bind/binding.js'

import {
  ClearedCompleted,
  DeletedTodo,
  type Filter,
  type Message,
  type Model,
  SavedEdit,
  SelectedFilter,
  StartedEditing,
  type Todo,
  type Todos,
  ToggledAll,
  ToggledTodo,
  UpdatedEditingTodo,
  UpdatedNewTodo,
} from './main.js'

// VIEW
//
// The fine-grained-rendering counterpart to `main.ts`'s `view`: the same
// TodoMVC-identical markup (classes, ids, structure), described as a
// `Binding` tree against the frozen `experimental/bind/binding.ts`
// constructors instead of built via the `html` factory.
//
// NOTE: `on()`'s `toMessage` always dispatches (frozen contract - no
// Option-returning variant like `html`'s `OnKeyDownPreventDefault`), so the
// Enter-only `.new-todo` submit and Enter/Escape-only `.edit` save/cancel
// semantics cannot be expressed as `on('keydown', ...)` bindings here without
// dispatching a spurious Message on every other key. `entry.finegrained.ts`
// attaches a single delegated `keydown` listener on the container for those
// two cases instead; every other interaction (click, dblclick, input, blur)
// binds directly below.

const todoItemClass = (todo: Todo, isEditing: boolean): string => {
  if (todo.completed && isEditing) {
    return 'completed editing'
  }

  if (todo.completed) {
    return 'completed'
  }

  if (isEditing) {
    return 'editing'
  }

  return ''
}

const filterTodos = (todos: Todos, filter: Filter): Todos => {
  if (filter === 'Active') {
    return Array.filter(todos, todo => !todo.completed)
  }

  if (filter === 'Completed') {
    return Array.filter(todos, todo => todo.completed)
  }

  return todos
}

const activeCount = (model: Model): number =>
  Array.length(Array.filter(model.todos, todo => !todo.completed))

const completedCount = (model: Model): number =>
  Array.length(model.todos) - activeCount(model)

const wordFor = (count: number): string => (count === 1 ? 'item' : 'items')

const isAllCompleted = (model: Model): boolean =>
  Array.isReadonlyArrayNonEmpty(model.todos) &&
  Array.every(model.todos, todo => todo.completed)

const todosPresenceKey = (model: Model): string =>
  Array.isReadonlyArrayEmpty(model.todos) ? 'Empty' : 'NonEmpty'

// HEADER

const headerBinding: Binding<Model, Message> = el<Model, Message>(
  'header',
  [attr<Model, Message>('class', 'header')],
  [
    el<Model, Message>('h1', [], [text<Model, Message>('todos')]),
    el<Model, Message>(
      'input',
      [
        attr<Model, Message>('class', 'new-todo'),
        attr<Model, Message>('placeholder', 'What needs to be done?'),
        attr<Model, Message>('autofocus', true),
        attr<Model, Message>('name', 'newTodo'),
        attr<Model, Message>('value', (model: Model) => model.newTodoText),
        on<Model, Message>('input', (event: Event) =>
          UpdatedNewTodo({ text: (event.target as HTMLInputElement).value }),
        ),
      ],
      [],
    ),
  ],
)

// MAIN

const editingTextFor = (model: Model): string =>
  model.editing._tag === 'Editing' ? model.editing.text : ''

const renderViewRow = (readTodo: () => Todo): Binding<Model, Message> =>
  el<Model, Message>(
    'div',
    [attr<Model, Message>('class', 'view')],
    [
      el<Model, Message>(
        'input',
        [
          attr<Model, Message>('class', 'toggle'),
          attr<Model, Message>('type', 'checkbox'),
          attr<Model, Message>('checked', () => readTodo().completed),
          on<Model, Message>('click', () => ToggledTodo({ id: readTodo().id })),
        ],
        [],
      ),
      el<Model, Message>(
        'label',
        [
          on<Model, Message>('dblclick', () =>
            StartedEditing({ id: readTodo().id }),
          ),
        ],
        [text<Model, Message>(() => readTodo().text)],
      ),
      el<Model, Message>(
        'button',
        [
          attr<Model, Message>('class', 'destroy'),
          on<Model, Message>('click', () => DeletedTodo({ id: readTodo().id })),
        ],
        [],
      ),
    ],
  )

const renderEditingRow = (readTodo: () => Todo): Binding<Model, Message> =>
  el<Model, Message>(
    'input',
    [
      attr<Model, Message>('class', 'edit'),
      attr<Model, Message>('value', editingTextFor),
      attr<Model, Message>('name', 'title'),
      attr<Model, Message>('id', `todo-${readTodo().id}`),
      attr<Model, Message>('autofocus', true),
      on<Model, Message>('input', (event: Event) =>
        UpdatedEditingTodo({ text: (event.target as HTMLInputElement).value }),
      ),
      on<Model, Message>('blur', () => SavedEdit()),
    ],
    [],
  )

const renderTodoRow = (readTodo: () => Todo): Binding<Model, Message> => {
  const isEditingThisTodo = (model: Model): boolean =>
    model.editing._tag === 'Editing' && model.editing.id === readTodo().id

  return el<Model, Message>(
    'li',
    [
      attr<Model, Message>('class', (model: Model) =>
        todoItemClass(readTodo(), isEditingThisTodo(model)),
      ),
    ],
    [
      cond<Model, Message>(
        (model: Model) => (isEditingThisTodo(model) ? 'Editing' : 'View'),
        (key: string) =>
          key === 'Editing'
            ? renderEditingRow(readTodo)
            : renderViewRow(readTodo),
      ),
    ],
  )
}

const mainSectionBinding: Binding<Model, Message> = el<Model, Message>(
  'section',
  [attr<Model, Message>('class', 'main')],
  [
    el<Model, Message>(
      'input',
      [
        attr<Model, Message>('class', 'toggle-all'),
        attr<Model, Message>('type', 'checkbox'),
        attr<Model, Message>('name', 'toggle'),
        attr<Model, Message>('checked', isAllCompleted),
        on<Model, Message>('click', () => ToggledAll()),
      ],
      [],
    ),
    el<Model, Message>(
      'label',
      [attr<Model, Message>('for', 'toggle-all')],
      [text<Model, Message>('Mark all as complete')],
    ),
    el<Model, Message>(
      'ul',
      [attr<Model, Message>('class', 'todo-list')],
      [
        list<Model, Message, Todo>(
          (model: Model): ReadonlyArray<Todo> =>
            filterTodos(model.todos, model.filter),
          (todo: Todo): string => todo.id,
          renderTodoRow,
        ),
      ],
    ),
  ],
)

// FOOTER

const filterEntries: ReadonlyArray<
  readonly [filter: Filter, label: string, href: string]
> = [
  ['All', 'All', '#/'],
  ['Active', 'Active', '#/active'],
  ['Completed', 'Completed', '#/completed'],
]

const renderFilterItem = (
  filter: Filter,
  label: string,
  href: string,
): Binding<Model, Message> =>
  el<Model, Message>(
    'li',
    [on<Model, Message>('click', () => SelectedFilter({ filter }))],
    [
      el<Model, Message>(
        'a',
        [
          attr<Model, Message>('href', href),
          attr<Model, Message>('class', (model: Model) =>
            model.filter === filter ? 'selected' : '',
          ),
        ],
        [text<Model, Message>(label)],
      ),
    ],
  )

const footerSectionBinding: Binding<Model, Message> = el<Model, Message>(
  'footer',
  [attr<Model, Message>('class', 'footer')],
  [
    el<Model, Message>(
      'span',
      [attr<Model, Message>('class', 'todo-count')],
      [
        el<Model, Message>(
          'strong',
          [],
          [
            text<Model, Message>((model: Model) =>
              activeCount(model).toString(),
            ),
          ],
        ),
        text<Model, Message>(
          (model: Model) => ` ${wordFor(activeCount(model))} left`,
        ),
      ],
    ),
    el<Model, Message>(
      'ul',
      [attr<Model, Message>('class', 'filters')],
      filterEntries.map(([filter, label, href]) =>
        renderFilterItem(filter, label, href),
      ),
    ),
    cond<Model, Message>(
      (model: Model) => (completedCount(model) > 0 ? 'HasCompleted' : 'None'),
      (key: string) =>
        key === 'HasCompleted'
          ? el<Model, Message>(
              'button',
              [
                attr<Model, Message>('class', 'clear-completed'),
                on<Model, Message>('click', () => ClearedCompleted()),
              ],
              [
                text<Model, Message>(
                  (model: Model) =>
                    `Clear completed (${completedCount(model)})`,
                ),
              ],
            )
          : text<Model, Message>(''),
    ),
  ],
)

/**
 * The fine-grained-rendering view for the lustre-benchmark TodoMVC slot.
 * Renders the same TodoMVC reference markup as `main.ts`'s `view` (same
 * classes, ids, and element structure) so the harness's CSS-selector-driven
 * runbook exercises this slot identically to the naive and optimised
 * slots. Mounted via `experimental/bind/render.ts`'s `mount()` from
 * `entry.finegrained.ts`, not through `Runtime.run`.
 */
export const bindView: Binding<Model, Message> = el<Model, Message>(
  'section',
  [attr<Model, Message>('class', 'todoapp')],
  [
    headerBinding,
    cond<Model, Message>(todosPresenceKey, (key: string) =>
      key === 'NonEmpty' ? mainSectionBinding : text<Model, Message>(''),
    ),
    cond<Model, Message>(todosPresenceKey, (key: string) =>
      key === 'NonEmpty' ? footerSectionBinding : text<Model, Message>(''),
    ),
  ],
)
