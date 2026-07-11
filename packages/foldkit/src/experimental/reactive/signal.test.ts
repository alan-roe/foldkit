import { Equal, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { makeRenderEffect } from './effect.js'
import { makeOwner, runWithOwner } from './owner.js'
import { flush } from './scheduler.js'
import { makeSignal } from './signal.js'

describe('makeSignal', () => {
  it('read and peek return the initial value', () => {
    const count = makeSignal(0)

    expect(count.read()).toBe(0)
    expect(count.peek()).toBe(0)
  })

  it('write updates the stored value', () => {
    const count = makeSignal(0)

    count.write(5)

    expect(count.peek()).toBe(5)
  })

  it('write with an Equal.equals-equivalent value is a no-op: no subscriber is marked dirty', () => {
    const maybeCount = makeSignal(Option.some(1))
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        maybeCount.read()
      })
    })
    expect(runCount).toBe(1)

    maybeCount.write(Option.some(1))
    flush()

    expect(runCount).toBe(1)
    expect(Equal.equals(maybeCount.peek(), Option.some(1))).toBe(true)
  })

  it('write with a non-equivalent value marks subscribers dirty', () => {
    const maybeCount = makeSignal(Option.some(1))
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        maybeCount.read()
      })
    })

    maybeCount.write(Option.some(2))
    flush()

    expect(runCount).toBe(2)
  })

  it('a custom equivalence overrides the default Equal.equals check', () => {
    const alwaysEqual = makeSignal(1, () => true)
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        alwaysEqual.read()
      })
    })

    alwaysEqual.write(2)
    flush()

    expect(runCount).toBe(1)
    expect(alwaysEqual.peek()).toBe(1)
  })

  it('peek never registers a dependency', () => {
    const count = makeSignal(0)
    const owner = makeOwner(Option.none())
    let runCount = 0
    runWithOwner(owner, () => {
      makeRenderEffect(() => {
        runCount += 1
        count.peek()
      })
    })

    count.write(1)
    flush()

    expect(runCount).toBe(1)
  })
})
