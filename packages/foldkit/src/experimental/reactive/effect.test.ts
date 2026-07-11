import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { getCurrentObserver, makeRenderEffect } from './effect.js'
import {
  disposeOwner,
  getCurrentOwner,
  makeOwner,
  onCleanup,
  runWithOwner,
} from './owner.js'
import { flush, isDirty } from './scheduler.js'
import { makeSignal } from './signal.js'

describe('makeRenderEffect', () => {
  it('runs the body immediately, once, at creation', () => {
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
      })
    })

    expect(runCount).toBe(1)
  })

  it('re-runs when a tracked signal writes a non-equivalent value, after flush', () => {
    const count = makeSignal(0)
    const owner = makeOwner(Option.none())
    const seen: Array<number> = []
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        seen.push(count.read())
      })
    })

    count.write(1)
    expect(isDirty()).toBe(true)
    flush()

    expect(seen).toEqual([0, 1])
    expect(isDirty()).toBe(false)
  })

  it('runs dirty effects in creation order within one flush pass', () => {
    const trigger = makeSignal(0)
    const owner = makeOwner(Option.none())
    const order: Array<string> = []
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        trigger.read()
        order.push('first')
      })
      makeRenderEffect(() => {
        trigger.read()
        order.push('second')
      })
      makeRenderEffect(() => {
        trigger.read()
        order.push('third')
      })
    })
    order.length = 0

    trigger.write(1)
    flush()

    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('dynamically re-tracks dependencies: switching signals stops reacting to the abandoned one', () => {
    const useFirst = makeSignal(true)
    const first = makeSignal('a')
    const second = makeSignal('b')
    const owner = makeOwner(Option.none())
    const seen: Array<string> = []
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        seen.push(useFirst.read() ? first.read() : second.read())
      })
    })
    expect(seen).toEqual(['a'])

    useFirst.write(false)
    flush()
    expect(seen).toEqual(['a', 'b'])

    first.write('changed')
    flush()
    expect(seen).toEqual(['a', 'b'])
    expect(isDirty()).toBe(false)

    second.write('also-changed')
    flush()
    expect(seen).toEqual(['a', 'b', 'also-changed'])
  })

  it('cascades within a single flush call: newly dirtied effects run in the same flush', () => {
    const source = makeSignal(0)
    const derived = makeSignal(0)
    const owner = makeOwner(Option.none())
    const log: Array<string> = []
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        const value = source.read()
        log.push(`first:${value}`)
        derived.write(value + 100)
      })
      makeRenderEffect(() => {
        log.push(`second:${derived.read()}`)
      })
    })
    log.length = 0

    source.write(1)
    flush()

    expect(log).toEqual(['first:1', 'second:101'])
    expect(isDirty()).toBe(false)
  })

  it('throws once a same-flush cascade fails to settle within the pass cap', () => {
    const looping = makeSignal(0)
    const owner = makeOwner(Option.none())
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        looping.write(looping.read() + 1)
      })
    })

    expect(() => flush()).toThrow('flush did not settle')
    expect(isDirty()).toBe(false)
  })

  it('a dirty effect whose owner was disposed before flush never runs', () => {
    const count = makeSignal(0)
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        count.read()
      })
    })
    expect(runCount).toBe(1)

    count.write(1)
    disposeOwner(owner)
    flush()

    expect(runCount).toBe(1)
  })

  it('dispose unsubscribes the effect: further writes to a formerly-tracked signal do not mark it dirty', () => {
    const count = makeSignal(0)
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        count.read()
      })
    })

    disposeOwner(owner)
    count.write(1)

    expect(isDirty()).toBe(false)
    flush()
    expect(runCount).toBe(1)
  })

  it('disposeOwner is idempotent', () => {
    const owner = makeOwner(Option.none())
    let cleanupCount = 0
    runWithOwner(owner, () => {
      onCleanup(() => {
        cleanupCount += 1
      })
    })

    disposeOwner(owner)
    disposeOwner(owner)

    expect(cleanupCount).toBe(1)
  })

  it('nested owner disposal runs child cleanups before the parent, depth-first', () => {
    const parent = makeOwner(Option.none())
    const order: Array<string> = []
    runWithOwner(parent, () => {
      const child = makeOwner(getCurrentOwner())
      runWithOwner(child, () => {
        onCleanup(() => {
          order.push('child')
        })
      })
      onCleanup(() => {
        order.push('parent')
      })
    })

    disposeOwner(parent)

    expect(order).toEqual(['child', 'parent'])
  })

  it('onCleanup registered outside any owner scope is a silent no-op', () => {
    expect(() => {
      onCleanup(() => {
        throw new Error('should never run')
      })
    }).not.toThrow()
  })

  it('getCurrentObserver is undefined outside a running render effect', () => {
    expect(getCurrentObserver()).toBeUndefined()

    const owner = makeOwner(Option.none())
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        expect(getCurrentObserver()).toBeDefined()
      })
    })

    expect(getCurrentObserver()).toBeUndefined()
  })
})
