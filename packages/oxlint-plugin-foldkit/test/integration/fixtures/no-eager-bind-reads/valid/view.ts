import { Bind } from 'foldkit/experimental'

type Model = Readonly<{ count: number; title: string }>

export const view = (model: Model) =>
  Bind.el(
    'div',
    [Bind.attr('title', () => model.title)],
    [Bind.text(() => model.count.toString())],
  )
