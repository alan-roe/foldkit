import { Array } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import type { Binding } from '../../../experimental/bind/binding.js'
import { el, text } from '../../../experimental/bind/binding.js'
import type { Mounted } from '../../../experimental/bind/render.js'
import { mount } from '../../../experimental/bind/render.js'
import { derived } from '../../../experimental/reactive/derived.js'
import { flush } from '../../../experimental/reactive/scheduler.js'
import type { ModelStore } from '../../../experimental/reactive/store.js'
import { makeModelStore } from '../../../experimental/reactive/store.js'

// FIXTURES
//
// `doubled` is declared at module scope, matching real usage (and avoiding
// the dev-mode post-mount warn this file's own `mount()` calls would
// otherwise trip for a test-body-scope `derived()` call).

type FitnessModel = Readonly<{ value: number }>

let fEvaluations = 0
const doubled = derived((model: FitnessModel) => {
  fEvaluations += 1
  return model.value * 2
})

/** A view with `holeCount` independent text positions, every one reading
 *  the same shared `doubled` derivation - the pre-primitive contract costs
 *  `holeCount` evaluations of `f` per relevant Model change; the
 *  primitive's job is to collapse that to exactly one. */
const view = (holeCount: number): Binding<FitnessModel, never> =>
  el<FitnessModel, never>(
    'div',
    [],
    Array.makeBy(holeCount, () =>
      text<FitnessModel, never>(model => String(doubled(model))),
    ),
  )

type Harness = Readonly<{
  store: ModelStore<FitnessModel>
  mounted: Mounted
  container: HTMLDivElement
}>

const setupHarness = (holeCount: number): Harness => {
  const store = makeModelStore<FitnessModel>({ value: 1 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const mounted = mount({
    binding: view(holeCount),
    view: store.view,
    dispatch: () => {},
    container,
    document,
  })
  return { store, mounted, container }
}

// GATES

describe('derived fitness gate', () => {
  let harness: Harness | undefined

  afterEach(() => {
    if (harness === undefined) {
      return
    }
    harness.mounted.dispose()
    harness.store.dispose()
    harness.container.remove()
    harness = undefined
  })

  it('D1: 50 holes reading one derived cost exactly 1 f evaluation per relevant Model change', () => {
    const holeCount = 50
    harness = setupHarness(holeCount)

    const callsBefore = fEvaluations
    harness.store.reconcile({ value: 2 })
    flush()

    expect(fEvaluations - callsBefore).toBe(1)
    expect(harness.container.textContent).toBe('4'.repeat(holeCount))
  })

  it('D2: the 1-evaluation cost holds per change, not per test run: two changes on 200 holes cost exactly 2 evaluations', () => {
    const holeCount = 200
    harness = setupHarness(holeCount)

    const callsBefore = fEvaluations
    harness.store.reconcile({ value: 3 })
    flush()
    harness.store.reconcile({ value: 4 })
    flush()

    expect(fEvaluations - callsBefore).toBe(2)
    expect(harness.container.textContent).toBe('8'.repeat(holeCount))
  })

  it('D3: a value-equal reconcile (new reference, same leaf value) costs zero evaluations regardless of hole count', () => {
    const holeCount = 50
    harness = setupHarness(holeCount)

    const callsBefore = fEvaluations
    // A new object reference, but `value` is still 1: the leaf's own
    // Equal.equals gate means no signal write ever propagates, so
    // `doubled` never re-evaluates.
    harness.store.reconcile({ value: 1 })
    flush()

    expect(fEvaluations - callsBefore).toBe(0)
  })
})
