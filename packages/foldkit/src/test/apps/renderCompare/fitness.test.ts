import { Array } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import type { Mounted } from '../../../experimental/bind/render.js'
import { mount } from '../../../experimental/bind/render.js'
import { flush } from '../../../experimental/reactive/scheduler.js'
import type { ModelStore } from '../../../experimental/reactive/store.js'
import { makeModelStore } from '../../../experimental/reactive/store.js'
import type { Message, Model } from './app.js'
import {
  ReversedTodos,
  ToggledTodo,
  UpdatedHeaderText,
  makeModelWithTodos,
  update,
} from './app.js'
import type { DomCounter } from './domCounter.js'
import { installDomCounter } from './domCounter.js'
import { view } from './viewBound.js'

// HARNESS

type Harness = Readonly<{
  store: ModelStore<Model>
  mounted: Mounted
  counter: DomCounter
  container: HTMLDivElement
  dispatch: (message: Message) => void
  getModel: () => Model
  getThunkEvaluations: () => number
}>

/**
 * Mounts the shared TodoMVC `viewBound` app over `todoCount` deterministic
 * todos, then resets both the DOM counter and the thunk-evaluation counter
 * so every gate measures only its own triggering action. `dispatch` runs
 * the same `update` -> `store.reconcile` -> `scheduler.flush` pipeline the
 * runtime will eventually drive.
 */
const setupHarness = (todoCount: number): Harness => {
  let model = makeModelWithTodos(todoCount)
  const store = makeModelStore(model)
  let thunkEvaluations = 0

  const dispatch = (message: Message): void => {
    const [next] = update(model, message)
    model = next
    store.reconcile(model)
    flush()
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const counter = installDomCounter(window)

  const mounted = mount({
    binding: view(),
    view: store.view,
    dispatch,
    container,
    document,
    onThunkEvaluation: () => {
      thunkEvaluations += 1
    },
  })

  counter.reset()
  thunkEvaluations = 0

  return {
    store,
    mounted,
    counter,
    container,
    dispatch,
    getModel: () => model,
    getThunkEvaluations: () => thunkEvaluations,
  }
}

/** Maps each row's unique `title` text to its `<li>` element, so identity
 *  can be compared across a reorder without relying on DOM position. */
const captureRowsByTitle = (container: Element): Map<string, Element> => {
  const rows = new Map<string, Element>()
  for (const li of container.querySelectorAll('li')) {
    const label = li.querySelector('label')
    if (label?.textContent !== null && label?.textContent !== undefined) {
      rows.set(label.textContent, li)
    }
  }
  return rows
}

// GATES

describe('fitness gates', () => {
  let harness: Harness | undefined

  afterEach(() => {
    if (harness === undefined) {
      return
    }
    harness.mounted.dispose()
    harness.store.dispose()
    harness.counter.uninstall()
    harness.container.remove()
    harness = undefined
  })

  it('G1 single-field: UpdatedHeaderText on 5,000 todos writes exactly one text node', () => {
    harness = setupHarness(5_000)

    harness.dispatch(UpdatedHeaderText({ text: 'Updated!' }))

    expect(harness.counter.read()).toStrictEqual({
      attributeWrites: 0,
      textWrites: 1,
      insertions: 0,
      removals: 0,
      moves: 0,
      total: 1,
    })
    expect(harness.getThunkEvaluations()).toBeLessThanOrEqual(4)
  })

  it('G2 row toggle: ToggledTodo on one of 1,000 writes only that row', () => {
    harness = setupHarness(1_000)
    const targetId = Array.getUnsafe(harness.getModel().todos, 500).id

    harness.dispatch(ToggledTodo({ id: targetId }))

    const counts = harness.counter.read()
    expect(counts.attributeWrites).toBeLessThanOrEqual(2)
    expect(counts.textWrites).toBe(0)
    expect(counts.insertions).toBe(0)
    expect(counts.removals).toBe(0)
  })

  it('G3 permute: ReversedTodos on 1,000 preserves every row element and moves rather than recreates', () => {
    harness = setupHarness(1_000)
    const before = captureRowsByTitle(harness.container)
    expect(before.size).toBe(1_000)

    harness.dispatch(ReversedTodos())

    const after = captureRowsByTitle(harness.container)
    expect(after.size).toBe(1_000)
    for (const [title, element] of before) {
      expect(after.get(title)).toBe(element)
    }

    const counts = harness.counter.read()
    expect(counts.textWrites).toBe(0)
    expect(counts.attributeWrites).toBe(0)
    expect(counts.removals).toBe(0)
    expect(counts.insertions).toBeGreaterThan(0)
  })

  it('G4 idempotence: reconciling the same Model reference then flushing writes nothing', () => {
    harness = setupHarness(1_000)

    harness.store.reconcile(harness.getModel())
    flush()

    expect(harness.counter.read()).toStrictEqual({
      attributeWrites: 0,
      textWrites: 0,
      insertions: 0,
      removals: 0,
      moves: 0,
      total: 0,
    })
  })
})
