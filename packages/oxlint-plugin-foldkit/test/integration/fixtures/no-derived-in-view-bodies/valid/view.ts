import { Bind, derived } from 'foldkit/experimental'

type Todo = Readonly<{ id: string; title: string; completed: boolean }>
type Model = Readonly<{ todos: ReadonlyArray<Todo> }>

const incompleteTodos = derived((model: Model) =>
  model.todos.filter(todo => !todo.completed),
)

const buildFooter = () => {
  const remainingCount = derived(
    (model: Model) => incompleteTodos(model).length,
  )
  return Bind.text(() => remainingCount({ todos: [] }).toString())
}

export const view = (model: Model) =>
  Bind.el(
    'div',
    [],
    [
      Bind.el(
        'ul',
        [],
        [
          Bind.list(
            incompleteTodos,
            (todo: Todo) => todo.id,
            (readItem: () => Todo) =>
              Bind.text(() => readItem().title),
          ),
        ],
      ),
      buildFooter(),
    ],
  )
