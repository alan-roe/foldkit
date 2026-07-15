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
    container.id = 'bench-root'
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

    // NOTE: the Enter dispatch is retried inside waitFor because the
    // `onMount` keydown listener attaches when the Mount action's fiber
    // starts, which is asynchronous relative to first render (og's
    // snabbdom OnMount hook has the same characteristic). A retried Enter
    // after the first successful add is a no-op: `AddedTodo` guards
    // empty/whitespace `newTodoText`, which resets on the first add.
    await vi.waitFor(() => {
      newTodoInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      expect(container.querySelectorAll('.todo-list li')).toHaveLength(1)
    })
    expect(container.querySelector('.todo-list li label')?.textContent).toBe(
      'buy milk',
    )
    expect(container.querySelector('.todo-count strong')?.textContent).toBe('1')
    expect(newTodoInput.value).toBe('')
  })
})
