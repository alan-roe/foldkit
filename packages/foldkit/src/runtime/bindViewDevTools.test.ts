import { Effect, Fiber, Match as M, Schema as S, SubscriptionRef } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Command } from '../command/index.js'
import type { DevToolsStore } from '../devTools/store.js'
import { latestEntryIndex } from '../devTools/store.js'
import { el, on, text } from '../experimental/bind/binding.js'
import { type Mounted, mount } from '../experimental/bind/render.js'
import {
  type ModelStore,
  __testingAllocatedSignalCount,
  makeModelStore,
} from '../experimental/reactive/store.js'
import { m } from '../message/index.js'
import { makeElement } from './runtime.js'

// FIXTURES: a one-field counter app. The bound text thunk stashes the
// `ModelStore.view` proxy it receives into `capturedView` on every
// evaluation, which is the only way a test outside `runtime.ts` can reach
// the internal store for the signal-leak assertion in "Signal-leak check"
// below - the runtime never exposes the store itself.

const Incremented = m('Incremented')
const Message = S.Union([Incremented])
type Message = typeof Message.Type

const Model = S.Struct({ value: S.Number })
type Model = typeof Model.Type

const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command<Message>>]>(),
    M.tagsExhaustive({
      Incremented: () => [{ value: model.value + 1 }, []],
    }),
  )

let capturedView: Model | undefined

const counterBindView = el<Model, Message>(
  'div',
  [],
  [
    text(model => {
      capturedView = model
      return `value:${model.value}`
    }),
    el('button', [on('click', () => Incremented())], [text('inc')]),
  ],
)

const collapseWhitespace = (html: string): string =>
  html.replace(/\s+/g, ' ').trim()

let container: HTMLElement
let runningFiber: Fiber.Fiber<void> | null = null

beforeEach(() => {
  capturedView = undefined
  container = document.createElement('div')
  container.id = 'app'
  document.body.appendChild(container)
})

afterEach(async () => {
  if (runningFiber !== null) {
    await Effect.runPromise(Fiber.interrupt(runningFiber))
    runningFiber = null
  }
  document.body.innerHTML = ''
})

describe('bindView + DevTools time travel', () => {
  it('reprocesses history exactly and keeps DOM listeners live after resume', async () => {
    let capturedStore: DevToolsStore | undefined

    const application = makeElement<Model, Message>({
      Model,
      init: () => [{ value: 0 }, []],
      update,
      bindView: counterBindView,
      container,
      devTools: {
        show: 'Always',
        mode: 'TimeTravel',
        overlay: store =>
          Effect.sync(() => {
            capturedStore = store
          }),
      },
    })

    runningFiber = Effect.runFork(application.start())

    await vi.waitFor(() => {
      expect(container.textContent).toContain('value:0')
    })
    expect(capturedStore).not.toBeUndefined()
    const devToolsStore = capturedStore!

    const button = () => container.querySelector('button')!

    // Build history: five real dispatches, value 0 -> 5.
    for (let clickCount = 0; clickCount < 5; clickCount += 1) {
      button().click()
    }
    await vi.waitFor(() => {
      expect(container.textContent).toContain('value:5')
    })

    const stateAfterClicks = await Effect.runPromise(
      SubscriptionRef.get(devToolsStore.stateRef),
    )
    expect(stateAfterClicks.entries.length).toBe(5)
    expect(latestEntryIndex(stateAfterClicks)).toBe(4)

    // SIGNAL-LEAK CHECK: sweep every recorded index twice. Allocation is
    // lazy per tracked path and this Model has exactly one leaf (`value`),
    // so the count must be stable (never growing) from the very first hop
    // onward, and the second sweep must never exceed the first.
    const firstSweepCounts: Array<number> = []
    for (let index = 0; index <= 4; index += 1) {
      await Effect.runPromise(devToolsStore.jumpTo(index))
      await vi.waitFor(() => {
        expect(container.textContent).toContain(`value:${index + 1}`)
      })
      expect(capturedView).not.toBeUndefined()
      firstSweepCounts.push(__testingAllocatedSignalCount(capturedView!))
    }
    expect(firstSweepCounts.every(count => count === firstSweepCounts[0])).toBe(
      true,
    )

    const secondSweepCounts: Array<number> = []
    for (let index = 0; index <= 4; index += 1) {
      await Effect.runPromise(devToolsStore.jumpTo(index))
      await vi.waitFor(() => {
        expect(container.textContent).toContain(`value:${index + 1}`)
      })
      secondSweepCounts.push(__testingAllocatedSignalCount(capturedView!))
    }
    expect(secondSweepCounts).toEqual(firstSweepCounts)

    // PAUSE: jump to an earlier entry (value:2, index 1). The historical
    // state must render, and a click on the bound handler must not
    // dispatch - no history growth, no model change.
    await Effect.runPromise(devToolsStore.jumpTo(1))
    await vi.waitFor(() => {
      expect(container.textContent).toContain('value:2')
    })

    button().click()
    // `noOpDispatch.dispatchSync` is synchronous and does nothing, so
    // there is no async gap to wait out: the assertion below observes the
    // click's (non-)effect immediately.
    expect(container.textContent).toContain('value:2')
    const stateStillPausedAtOldIndex = await Effect.runPromise(
      SubscriptionRef.get(devToolsStore.stateRef),
    )
    expect(stateStillPausedAtOldIndex.entries.length).toBe(5)
    expect(stateStillPausedAtOldIndex.isPaused).toBe(true)

    // Jump forward while still paused (value:4, index 3).
    await Effect.runPromise(devToolsStore.jumpTo(3))
    await vi.waitFor(() => {
      expect(container.textContent).toContain('value:4')
    })

    // RESUME: DOM must return to the live model (value:5, untouched by the
    // blocked click during pause), with real dispatch working again.
    await Effect.runPromise(devToolsStore.resume)
    await vi.waitFor(() => {
      expect(container.textContent).toContain('value:5')
    })
    const stateAfterResume = await Effect.runPromise(
      SubscriptionRef.get(devToolsStore.stateRef),
    )
    expect(stateAfterResume.isPaused).toBe(false)
    expect(stateAfterResume.entries.length).toBe(5)

    // REPROCESSING EXACTNESS: the resumed live render must match byte for
    // byte what a fresh mount of the same live Model produces.
    const freshContainer = document.createElement('div')
    const freshStore: ModelStore<Model & object> = makeModelStore({
      value: 5,
    })
    let freshMounted: Mounted | undefined
    try {
      freshMounted = mount({
        binding: counterBindView,
        view: freshStore.view,
        dispatch: () => {},
        container: freshContainer,
        document: window.document,
      })
      expect(collapseWhitespace(container.innerHTML)).toBe(
        collapseWhitespace(freshContainer.innerHTML),
      )
    } finally {
      freshMounted?.dispose()
      freshStore.dispose()
    }

    // REGRESSION CHECK: a real click after resume must dispatch and update
    // the DOM (the "keep DOM listeners live after DevTools resume" case -
    // proves `dispatchTargetRef` was repointed back to the live dispatch,
    // not left on `noOpDispatch` from the jumpTo replay).
    button().click()
    await vi.waitFor(() => {
      expect(container.textContent).toContain('value:6')
    })
    const stateAfterLiveClick = await Effect.runPromise(
      SubscriptionRef.get(devToolsStore.stateRef),
    )
    expect(stateAfterLiveClick.entries.length).toBe(6)
  })
})
