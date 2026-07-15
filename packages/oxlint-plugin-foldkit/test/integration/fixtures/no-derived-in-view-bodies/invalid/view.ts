import { Bind, derived } from 'foldkit/experimental'

type Todo = Readonly<{ id: string; title: string }>
type Model = Readonly<{ todos: ReadonlyArray<Todo> }>

export const view = (model: Model) =>
  Bind.el(
    'ul',
    [],
    [
      Bind.list(
        (m: Model) => m.todos,
        (todo: Todo) => todo.id,
        (readItem: () => Todo) => {
          const titleLength = derived((item: Todo) => item.title.length)
          return Bind.text(() => titleLength(readItem()).toString())
        },
      ),
    ],
  )
