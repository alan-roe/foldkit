import { Bind } from 'foldkit/experimental'

type Model = Readonly<{ count: number; title: string }>

export const view = (model: Model) => {
  const count = model.count

  return Bind.el(
    'div',
    [Bind.attr('title', model.title)],
    [Bind.text(() => count)],
  )
}
