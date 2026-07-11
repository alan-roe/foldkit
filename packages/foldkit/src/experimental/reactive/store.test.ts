import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { evo } from '../../struct/index.js'
import { makeRenderEffect } from './effect.js'
import { disposeOwner, makeOwner, runWithOwner } from './owner.js'
import { flush } from './scheduler.js'
import { __testingAllocatedSignalCount, makeModelStore } from './store.js'

type Address = Readonly<{ city: string; zip: string }>

type Model = Readonly<{
  count: number
  name: string
  nickname: Option.Option<string>
  address: Address
  tags: ReadonlyArray<string>
}>

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  count: 0,
  name: 'Ada',
  nickname: Option.none(),
  address: { city: 'Lisbon', zip: '1000' },
  tags: ['admin'],
  ...overrides,
})

describe('makeModelStore', () => {
  it('set and delete on the view proxy throw: reconcile is the single writer', () => {
    const store = makeModelStore(makeModel())

    expect(() => {
      // @ts-expect-error intentionally mutating a read-only view for the test
      store.view.count = 1
    }).toThrow()
    expect(() => {
      // @ts-expect-error intentionally mutating a read-only view for the test
      delete store.view.count
    }).toThrow()
  })

  it('reconciling the same Model reference twice fires zero effects on the second call', () => {
    const store = makeModelStore(makeModel())
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        store.view.count
      })
    })
    expect(runCount).toBe(1)

    const next = makeModel({ count: 1 })
    store.reconcile(next)
    flush()
    expect(runCount).toBe(2)

    store.reconcile(next)
    flush()
    expect(runCount).toBe(2)

    disposeOwner(owner)
  })

  it('dispose then a fresh store from the same Model is semantically invisible', () => {
    const model = makeModel({ count: 5 })

    const storeA = makeModelStore(model)
    const ownerA = makeOwner(Option.none())
    const seenByA: Array<number> = []
    runWithOwner(ownerA, () => {
      makeRenderEffect(() => {
        seenByA.push(storeA.view.count)
      })
    })
    disposeOwner(ownerA)
    storeA.dispose()

    const storeB = makeModelStore(model)
    const ownerB = makeOwner(Option.none())
    const seenByB: Array<number> = []
    runWithOwner(ownerB, () => {
      makeRenderEffect(() => {
        seenByB.push(storeB.view.count)
      })
    })
    disposeOwner(ownerB)

    expect(seenByB).toEqual(seenByA)
  })

  it('untracked and unread paths never allocate a signal', () => {
    const store = makeModelStore(makeModel())
    expect(__testingAllocatedSignalCount(store.view)).toBe(0)

    const untrackedCount = store.view.count
    expect(untrackedCount).toBe(0)
    expect(__testingAllocatedSignalCount(store.view)).toBe(0)

    const owner = makeOwner(Option.none())
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        store.view.name
      })
    })
    expect(__testingAllocatedSignalCount(store.view)).toBe(1)

    disposeOwner(owner)
  })

  it('evo() structural sharing: reconciling a change to one branch does not re-run effects on untouched branches', () => {
    const model = makeModel({ address: { city: 'Lisbon', zip: '1000' } })
    const store = makeModelStore(model)
    const owner = makeOwner(Option.none())
    let nameRuns = 0
    let addressRuns = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        nameRuns += 1
        store.view.name
      })
      makeRenderEffect(() => {
        addressRuns += 1
        store.view.address.city
      })
    })
    expect(nameRuns).toBe(1)
    expect(addressRuns).toBe(1)

    const next = evo(model, { count: () => 1 })
    store.reconcile(next)
    flush()

    expect(nameRuns).toBe(1)
    expect(addressRuns).toBe(1)

    disposeOwner(owner)
  })

  it('nested-record proxy identity is stable across reconciles when only leaves changed', () => {
    const model = makeModel()
    const store = makeModelStore(model)

    const addressViewBefore = store.view.address
    const next = evo(model, {
      address: address => evo(address, { city: () => 'Porto' }),
    })
    store.reconcile(next)
    const addressViewAfter = store.view.address

    expect(addressViewAfter).toBe(addressViewBefore)
    expect(addressViewAfter.city).toBe('Porto')
  })

  it('Option leaves fire only when not Equal.equals', () => {
    const store = makeModelStore(makeModel({ nickname: Option.some('Al') }))
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        store.view.nickname
      })
    })
    expect(runCount).toBe(1)

    const reallocatedEqualOption = makeModel({ nickname: Option.some('Al') })
    store.reconcile(reallocatedEqualOption)
    flush()
    expect(runCount).toBe(1)

    const differentOption = makeModel({ nickname: Option.some('Bo') })
    store.reconcile(differentOption)
    flush()
    expect(runCount).toBe(2)

    disposeOwner(owner)
  })
})
