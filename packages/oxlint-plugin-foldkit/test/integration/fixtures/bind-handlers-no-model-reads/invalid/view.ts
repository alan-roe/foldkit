import { Bind } from 'foldkit/experimental'

type Model = Readonly<{ count: number }>
type Message = Readonly<{ _tag: 'Incremented'; amount: number }>

const Incremented = (amount: number): Message => ({
  _tag: 'Incremented',
  amount,
})

export const view = (model: Model) =>
  Bind.el(
    'button',
    [Bind.on('click', (event: Event) => Incremented(model.count))],
    [Bind.text(() => model.count.toString())],
  )
