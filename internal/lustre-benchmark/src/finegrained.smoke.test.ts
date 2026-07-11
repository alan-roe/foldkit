import { mount } from 'foldkit/experimental/bind/render.js'
import { flush } from 'foldkit/experimental/reactive/scheduler.js'
import { makeModelStore } from 'foldkit/experimental/reactive/store.js'
import { describe, expect, it } from 'vitest'

import { bindView } from './main.finegrained.js'
import { GeneratedTodo, type Message, init, update } from './main.js'

describe('main.finegrained bindView', () => {
  it('boots in happy-dom and renders a row after dispatching GeneratedTodo', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const [initialModel] = init()
    const store = makeModelStore(initialModel)
    let currentModel = initialModel

    const dispatch = (message: Message): void => {
      const [nextModel] = update(currentModel, message)
      currentModel = nextModel
      store.reconcile(currentModel)
      flush()
    }

    mount({
      binding: bindView,
      view: store.view,
      dispatch,
      container,
      document,
    })
    dispatch(GeneratedTodo({ id: 'todo-1', timestamp: 0, text: 'buy milk' }))

    expect(container.querySelectorAll('.todo-list li')).toHaveLength(1)
    expect(container.querySelector('.todo-list li label')?.textContent).toBe(
      'buy milk',
    )
    expect(container.querySelector('.todo-count strong')?.textContent).toBe('1')

    container.remove()
  })
})
