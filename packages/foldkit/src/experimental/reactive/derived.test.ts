import { Array, Option } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installDomCounter } from '../../test/apps/renderCompare/domCounter.js'
import { type Binding, type Bound, el, text } from '../bind/binding.js'
import { type Mounted, mount } from '../bind/render.js'
import { submodel } from '../bind/submodel.js'
import { __testingAllocatedComputedCount, derived } from './derived.js'
import { makeRenderEffect } from './effect.js'
import { disposeOwner, makeOwner, runWithOwner } from './owner.js'
import { flush } from './scheduler.js'
import { __testingAllocatedSignalCount, makeModelStore } from './store.js'

// FIXTURES
//
// Every `derived` instance below is declared at module scope, matching the
// contract's own module-scope enforcement guidance: the post-mount warn
// diagnostic is a one-way, process-lifetime latch (flips true the moment
// the first `mount()` anywhere completes), so a test-body-scope `derived()`
// call anywhere in this file after the first mount would spuriously warn.
// Only the "dev diagnostics" describe block below intentionally provokes
// that path.

type Model = Readonly<{ a: number; b: number }>

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  a: 1,
  b: 10,
  ...overrides,
})

// INVARIANT 1: SINGLE WRITER

let singleWriterCalls = 0
const doubledA = derived((model: Model) => {
  singleWriterCalls += 1
  return model.a * 2
})

describe('derived: single writer', () => {
  it("a computed's value changes only through its own re-evaluation, observable via f call counts", () => {
    const store = makeModelStore(makeModel({ a: 3 }))
    const callsBefore = singleWriterCalls

    const owner = makeOwner(Option.none())
    const seen: Array<number> = []
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        seen.push(doubledA(store.view))
      })
    })
    expect(singleWriterCalls - callsBefore).toBe(1)
    expect(seen).toEqual([6])

    // Reading through more holes without a Model change reuses the cached
    // value: no bypass write, no extra evaluation.
    expect(doubledA(store.view)).toBe(6)
    expect(doubledA(store.view)).toBe(6)
    expect(singleWriterCalls - callsBefore).toBe(1)

    // An unrelated field write never touches this computed's dependency.
    store.reconcile(makeModel({ a: 3, b: 99 }))
    flush()
    expect(singleWriterCalls - callsBefore).toBe(1)

    store.reconcile(makeModel({ a: 5, b: 99 }))
    flush()
    expect(singleWriterCalls - callsBefore).toBe(2)
    expect(seen).toEqual([6, 10])

    disposeOwner(owner)
    store.dispose()
  })
})

// INVARIANT 2: REBUILDABLE

let rebuildableCalls = 0
const sumAB = derived((model: Model) => {
  rebuildableCalls += 1
  return model.a + model.b
})

describe('derived: rebuildable', () => {
  it('a fresh store over the same Model yields identical derived values', () => {
    const model = makeModel({ a: 3, b: 4 })

    const storeA = makeModelStore(model)
    const valueFromA = sumAB(storeA.view)

    const storeB = makeModelStore(model)
    const valueFromB = sumAB(storeB.view)

    expect(valueFromB).toBe(valueFromA)
    expect(valueFromB).toBe(7)

    storeA.dispose()
    storeB.dispose()
  })

  it('disposing the store and rebuilding a fresh one over the current Model reproduces the same value: derived state is a cache, never authoritative', () => {
    const model = makeModel({ a: 8, b: 2 })

    const store1 = makeModelStore(model)
    const first = sumAB(store1.view)
    store1.dispose()

    const store2 = makeModelStore(model)
    const second = sumAB(store2.view)

    expect(second).toBe(first)
    expect(second).toBe(10)

    store2.dispose()
  })
})

// INVARIANT 3: TIME TRAVEL

let timeTravelCalls = 0
const tenTimesA = derived((model: Model) => {
  timeTravelCalls += 1
  return model.a * 10
})

describe('derived: time travel', () => {
  it('reconcile(historicalModel) recomputes through the same computed nodes; allocated signal and computed counts stay flat across repeated history sweeps', () => {
    const history: ReadonlyArray<Model> = Array.makeBy(5, index =>
      makeModel({ a: index }),
    )
    const store = makeModelStore(history[0]!)

    const owner = makeOwner(Option.none())
    const results: Array<number> = []
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        results.push(tenTimesA(store.view))
      })
    })

    const firstSweepComputedCounts: Array<number> = []
    const firstSweepSignalCounts: Array<number> = []
    for (const historicalModel of history) {
      store.reconcile(historicalModel)
      flush()
      firstSweepComputedCounts.push(__testingAllocatedComputedCount(store.view))
      firstSweepSignalCounts.push(__testingAllocatedSignalCount(store.view))
    }
    expect(
      firstSweepComputedCounts.every(
        count => count === firstSweepComputedCounts[0],
      ),
    ).toBe(true)
    expect(
      firstSweepSignalCounts.every(
        count => count === firstSweepSignalCounts[0],
      ),
    ).toBe(true)

    const secondSweepComputedCounts: Array<number> = []
    for (const historicalModel of history) {
      store.reconcile(historicalModel)
      flush()
      secondSweepComputedCounts.push(
        __testingAllocatedComputedCount(store.view),
      )
    }
    expect(secondSweepComputedCounts).toEqual(firstSweepComputedCounts)

    const expectedPerSweep = history.map(model => model.a * 10)
    expect(results).toEqual([...expectedPerSweep, ...expectedPerSweep])

    disposeOwner(owner)
    store.dispose()
  })
})

// INVARIANT 4: IDEMPOTENT

let idempotentACalls = 0
const identityA = derived((model: Model) => {
  idempotentACalls += 1
  return model.a
})

let idempotentBCalls = 0
const isPositive = derived((model: Model) => {
  idempotentBCalls += 1
  return model.a > 0
})

describe('derived: idempotent', () => {
  it('(a) reconciling with the identical Model reference triggers zero f evaluations and zero subscriber runs', () => {
    const model = makeModel({ a: 7 })
    const store = makeModelStore(model)

    const owner = makeOwner(Option.none())
    let subscriberRuns = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        subscriberRuns += 1
        identityA(store.view)
      })
    })
    const callsBefore = idempotentACalls
    const runsBefore = subscriberRuns

    store.reconcile(model)
    flush()

    expect(idempotentACalls - callsBefore).toBe(0)
    expect(subscriberRuns - runsBefore).toBe(0)

    disposeOwner(owner)
    store.dispose()
  })

  it('(b) a dependency change whose recompute is value-equal costs exactly one f evaluation, one subscriber pass, zero DOM writes', () => {
    const store = makeModelStore(makeModel({ a: 1 }))
    let subscriberRuns = 0
    const binding: Binding<Model, never> = text<Model, never>(model => {
      subscriberRuns += 1
      return String(isPositive(model))
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const counter = installDomCounter(window)
    const mounted = mount({
      binding,
      view: store.view,
      dispatch: () => {},
      container,
      document,
    })

    const callsBefore = idempotentBCalls
    const runsBefore = subscriberRuns
    counter.reset()

    // `a` changes (1 -> 2, a real dependency write) but `isPositive`'s
    // output stays `true`: the eager dirty-forwarding semantic still costs
    // one subscriber pass, with the DOM write gated to zero by the
    // last-written-value memo.
    store.reconcile(makeModel({ a: 2 }))
    flush()

    expect(idempotentBCalls - callsBefore).toBe(1)
    expect(subscriberRuns - runsBefore).toBe(1)
    expect(counter.read().total).toBe(0)

    mounted.dispose()
    store.dispose()
    counter.uninstall()
    container.remove()
  })
})

// INVARIANT 5: MATERIALIZE PARITY

let materializeParityCalls = 0
const product = derived((model: Model) => {
  materializeParityCalls += 1
  return model.a * model.b
})

describe('derived: materialize parity', () => {
  it('g(rawModel) equals the live-path value for the same Model epoch', () => {
    const model = makeModel({ a: 3, b: 4 })

    const rawValue = product(model) // not a store proxy: raw fallback
    const store = makeModelStore(model)
    const liveValue = product(store.view)

    expect(rawValue).toBe(liveValue)
    expect(rawValue).toBe(12)

    store.dispose()
  })

  it('the raw fallback never caches: repeated g(rawModel) calls re-evaluate f every time', () => {
    const model = makeModel({ a: 2, b: 5 })
    const callsBefore = materializeParityCalls

    product(model)
    product(model)
    product(model)

    expect(materializeParityCalls - callsBefore).toBe(3)
  })
})

// SEAM INTERPLAY: submodel() / Sub.select, per the Dialog-shaped published
// leaf convention in submodel.test.ts.

type SeamChildModel = Readonly<{ visible: boolean }>
type SeamChildMessage = never
type SeamPublished = Readonly<{ isVisible: Bound<SeamChildModel, boolean> }>

let seamCalls = 0
const isVisible = derived((model: SeamChildModel) => {
  seamCalls += 1
  return model.visible
})

const seamChildView = (
  viewInputs: Readonly<{
    toView: (
      published: SeamPublished,
    ) => Binding<SeamChildModel, SeamChildMessage>
  }>,
): Binding<SeamChildModel, SeamChildMessage> => viewInputs.toView({ isVisible })

const HOLE_COUNT = 3

type NestedParentModel = Readonly<{ dialog: SeamChildModel }>
type NestedParentMessage = never

const selectNestedDialog: Bound<NestedParentModel, SeamChildModel> = model =>
  model.dialog

const nestedConsumerToView = (
  published: Readonly<{ isVisible: Bound<NestedParentModel, boolean> }>,
): Binding<NestedParentModel, NestedParentMessage> =>
  el<NestedParentModel, NestedParentMessage>(
    'div',
    [],
    Array.makeBy(HOLE_COUNT, () =>
      text<NestedParentModel, NestedParentMessage>(model =>
        String(published.isVisible(model)),
      ),
    ),
  )

const nestedBinding: Binding<NestedParentModel, NestedParentMessage> = submodel<
  NestedParentModel,
  NestedParentMessage,
  SeamChildModel,
  SeamChildMessage,
  SeamPublished
>({
  select: selectNestedDialog,
  toMessage: message => message,
  view: seamChildView,
  viewInputs: { toView: nestedConsumerToView },
})

type OptionParentModel = Readonly<{ dialog: Option.Option<SeamChildModel> }>
type OptionParentMessage = never

const defaultSeamChild: SeamChildModel = { visible: false }

const selectOptionDialog: Bound<OptionParentModel, SeamChildModel> = model =>
  Option.getOrElse(model.dialog, () => defaultSeamChild)

const optionConsumerToView = (
  published: Readonly<{ isVisible: Bound<OptionParentModel, boolean> }>,
): Binding<OptionParentModel, OptionParentMessage> =>
  el<OptionParentModel, OptionParentMessage>(
    'div',
    [],
    Array.makeBy(HOLE_COUNT, () =>
      text<OptionParentModel, OptionParentMessage>(model =>
        String(published.isVisible(model)),
      ),
    ),
  )

const optionBinding: Binding<OptionParentModel, OptionParentMessage> = submodel<
  OptionParentModel,
  OptionParentMessage,
  SeamChildModel,
  SeamChildMessage,
  SeamPublished
>({
  select: selectOptionDialog,
  toMessage: message => message,
  view: seamChildView,
  viewInputs: { toView: optionConsumerToView },
})

describe('derived: seam interplay (submodel / Sub.select)', () => {
  it('a nested-record select memoizes: N holes cost exactly 1 f evaluation per relevant Model change', () => {
    const store = makeModelStore<NestedParentModel>({
      dialog: { visible: false },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const mounted = mount({
      binding: nestedBinding,
      view: store.view,
      dispatch: () => {},
      container,
      document,
    })

    const callsBefore = seamCalls
    store.reconcile({ dialog: { visible: true } })
    flush()

    expect(seamCalls - callsBefore).toBe(1)
    expect(container.textContent).toBe('true'.repeat(HOLE_COUNT))

    mounted.dispose()
    store.dispose()
    container.remove()
  })

  it('an Option-crossing select takes the raw fallback: N holes cost N f evaluations per relevant Model change', () => {
    const store = makeModelStore<OptionParentModel>({
      dialog: Option.some({ visible: false }),
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const mounted = mount({
      binding: optionBinding,
      view: store.view,
      dispatch: () => {},
      container,
      document,
    })

    const callsBefore = seamCalls
    store.reconcile({ dialog: Option.some({ visible: true }) })
    flush()

    expect(seamCalls - callsBefore).toBe(HOLE_COUNT)
    expect(container.textContent).toBe('true'.repeat(HOLE_COUNT))

    mounted.dispose()
    store.dispose()
    container.remove()
  })
})

// DEV DIAGNOSTICS

describe('derived: dev diagnostics', () => {
  let mountedForWarnTest: Mounted | undefined
  let containerForWarnTest: HTMLDivElement | undefined

  afterEach(() => {
    mountedForWarnTest?.dispose()
    mountedForWarnTest = undefined
    containerForWarnTest?.remove()
    containerForWarnTest = undefined
  })

  it('throws when called while a tracked observer is active: thunk-time creation is always a leak', () => {
    const owner = makeOwner(Option.none())

    expect(() => {
      runWithOwner(owner, () => {
        makeRenderEffect(() => {
          derived((model: Model) => model.a)
        })
      })
    }).toThrow(/module scope/i)

    disposeOwner(owner)
  })

  it('warns, never throws, when created after the first bind-path mount has completed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    containerForWarnTest = document.createElement('div')
    document.body.appendChild(containerForWarnTest)
    const store = makeModelStore(makeModel())
    mountedForWarnTest = mount({
      binding: text<Model, never>(model => String(model.a)),
      view: store.view,
      dispatch: () => {},
      container: containerForWarnTest,
      document,
    })

    expect(() => {
      derived((model: Model) => model.a)
    }).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/module scope/i))

    store.dispose()
    warnSpy.mockRestore()
  })
})
