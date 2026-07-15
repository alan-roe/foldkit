import { Effect, Fiber } from 'effect'
import { Runtime } from 'foldkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindView } from './main.finegrained.js'
import { Model, init, update } from './main.js'

let container: HTMLElement
let runningFiber: Fiber.Fiber<void> | null = null

afterEach(async () => {
  if (runningFiber !== null) {
    await Effect.runPromise(Fiber.interrupt(runningFiber))
    runningFiber = null
  }
  container.remove()
})

describe('main.finegrained bindView', () => {
  it('boots via Runtime.makeElement and renders a row after Enter-submitting a new todo', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    const application = Runtime.makeElement({
      Model,
      init,
      update,
      bindView,
      container,
      devTools: false,
    })

    runningFiber = Effect.runFork(application.start())

    const newTodoInput = await vi.waitFor(() => {
      const input = container.querySelector<HTMLInputElement>('.new-todo')
      expect(input).not.toBeNull()
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      return input as HTMLInputElement
    })

    newTodoInput.value = 'buy milk'
    newTodoInput.dispatchEvent(new Event('input', { bubbles: true }))
    newTodoInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )

    await vi.waitFor(() => {
      expect(container.querySelectorAll('.todo-list li')).toHaveLength(1)
    })
    expect(container.querySelector('.todo-list li label')?.textContent).toBe(
      'buy milk',
    )
    expect(container.querySelector('.todo-count strong')?.textContent).toBe(
      '1',
    )
    expect(newTodoInput.value).toBe('')
  })
})
