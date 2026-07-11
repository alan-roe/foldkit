import { Bind } from 'foldkit/experimental'

type Model = Readonly<{ count: number }>
type Message =
  | Readonly<{ _tag: 'Incremented' }>
  | Readonly<{ _tag: 'Typed'; value: string }>

const Incremented: Message = { _tag: 'Incremented' }

const Typed = (value: string): Message => ({ _tag: 'Typed', value })

export const view = (model: Model) =>
  Bind.el(
    'div',
    [],
    [
      Bind.el(
        'button',
        [Bind.on('click', () => Incremented)],
        [Bind.text(() => model.count.toString())],
      ),
      Bind.el(
        'input',
        [
          Bind.on('input', (event: Event) =>
            Typed((event.target as HTMLInputElement).value),
          ),
        ],
        [],
      ),
    ],
  )
