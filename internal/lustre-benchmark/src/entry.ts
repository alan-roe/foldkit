import { Runtime } from 'foldkit'

import { Message, Model, init, update, view } from './main'

const container = document.querySelector('section.todoapp')
if (!(container instanceof HTMLElement)) {
  throw new Error(
    'Lustre benchmark: expected <section class="todoapp"> mount point',
  )
}

container.id = 'todoapp'

const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  container,
  devTools: {
    Message,
  },
})

Runtime.run(program)
