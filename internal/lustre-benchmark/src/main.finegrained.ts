import { Array, Effect, Queue, Stream } from 'effect'
import { Mount } from 'foldkit'
import { Bind } from 'foldkit/experimental'

import {
  AddedTodo,
  CancelledEdit,
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

type Binding<Model, Message> = Bind.Binding<Model, Message>
const { attr, cond, el, list, on, onMount, prop, text } = Bind

// VIEW
//
// The fine-grained-rendering counterpart to `main.ts`'s `view`: the same
// TodoMVC-identical markup (classes, ids, structure), described as a
// `Binding` tree against `foldkit/experimental`'s `Bind` constructors
// instead of built via the `html` factory.

// MOUNT ACTIONS
//
// `on()`'s `toMessage` always dispatches (frozen IR contract - no
// Option-returning variant like `html`'s `OnKeyDownPreventDefault`), so the
// Enter-only `.new-todo` submit and Enter/Escape-only `.edit` save/cancel
// semantics are attached as per-element `Mount.defineStream` actions below
// instead of `on('keydown', ...)` bindings: the Stream only offers a
// Message for the key that matters, so every other keystroke reaches
// neither `dispatch` nor `update`.

const SubmitNewTodoOnEnter = Mount.defineStream(
  'SubmitNewTodoOnEnter',
  AddedTodo,
)(element =>
  Stream.callback<typeof AddedTodo.Type>(queue =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const handler = (event: Event): void => {
            const keyboardEvent = event as KeyboardEvent
            if (keyboardEvent.key !== 'Enter') {
              return
            }
            keyboardEvent.preventDefault()
            Queue.offerUnsafe(queue, AddedTodo())
          }
          element.addEventListener('keydown', handler)
          return handler
        }),
        handler =>
          Effect.sync(() => element.removeEventListener('keydown', handler)),
      )
      return yield* Effect.never
    }),
  ),
)

const SaveOrCancelEditOnKey = Mount.defineStream(
  'SaveOrCancelEditOnKey',
  SavedEdit,
  CancelledEdit,
)(element =>
  Stream.callback<typeof SavedEdit.Type | typeof CancelledEdit.Type>(queue =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const handler = (event: Event): void => {
            const keyboardEvent = event as KeyboardEvent
            if (keyboardEvent.key === 'Enter') {
              keyboardEvent.preventDefault()
              Queue.offerUnsafe(queue, SavedEdit())
              return
            }
            if (keyboardEvent.key === 'Escape') {
              keyboardEvent.preventDefault()
              Queue.offerUnsafe(queue, CancelledEdit())
            }
          }
          element.addEventListener('keydown', handler)
          return handler
        }),
        handler =>
          Effect.sync(() => element.removeEventListener('keydown', handler)),
      )
      return yield* Effect.never
    }),
  ),
)

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
        prop<Model, Message>('value', (model: Model) => model.newTodoText),
        on<Model, Message>('input', (event: Event) =>
          UpdatedNewTodo({ text: (event.target as HTMLInputElement).value }),
        ),
        onMount<Model, Message>(SubmitNewTodoOnEnter()),
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
          prop<Model, Message>('checked', () => readTodo().completed),
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
      prop<Model, Message>('value', editingTextFor),
      attr<Model, Message>('name', 'title'),
      attr<Model, Message>('id', `todo-${readTodo().id}`),
      attr<Model, Message>('autofocus', true),
      on<Model, Message>('input', (event: Event) =>
        UpdatedEditingTodo({ text: (event.target as HTMLInputElement).value }),
      ),
      on<Model, Message>('blur', () => SavedEdit()),
      onMount<Model, Message>(SaveOrCancelEditOnKey()),
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
        prop<Model, Message>('checked', isAllCompleted),
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
 * slots. Mounted via `foldkit`'s `Runtime.run(Runtime.makeElement({ …,
 * bindView }))` from `entry.finegrained.ts`, the same public runtime
 * surface `entry.ts` and `entry.optimised.ts` use for their `view`-based
 * slots.
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
