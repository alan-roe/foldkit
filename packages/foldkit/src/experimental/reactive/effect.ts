import { onCleanup } from './owner.js'
import type { SchedulableEffect } from './scheduler.js'

// OBSERVER

/** The ambient tracking scope a signal read registers against: the running
 *  render effect. Exposes `addSource` so a signal can hand back its own
 *  unsubscribe closure, collected fresh on every effect run. */
export type TrackedObserver = SchedulableEffect &
  Readonly<{
    addSource: (unsubscribeSource: () => void) => void
  }>

let currentObserver: TrackedObserver | undefined
let nextEffectId = 0

/** The render effect currently running, if any. `signal.ts` reads this to
 *  decide whether a read should register a dependency. `undefined` outside
 *  any render effect: reads are plain, untracked reads. */
export const getCurrentObserver = (): TrackedObserver | undefined =>
  currentObserver

// RENDER EFFECT

/**
 * Runs `run` immediately, tracking every signal read during that run as a
 * dependency. Re-runs whenever a tracked signal writes a non-equivalent
 * value and the effect is drained by `scheduler.flush()`. Dependencies are
 * dynamic: each run first unsubscribes from every signal read on the
 * previous run, then re-collects from scratch.
 *
 * Owned by the current owner at creation: disposing that owner unsubscribes
 * this effect from every tracked signal and permanently prevents further
 * runs, including a run already scheduled but not yet flushed.
 */
export const makeRenderEffect = (run: () => void): void => {
  nextEffectId += 1
  const id = nextEffectId
  let sources: Array<() => void> = []
  let isDisposed = false

  const execute = (): void => {
    if (isDisposed) {
      return
    }
    for (const unsubscribeSource of sources) {
      unsubscribeSource()
    }
    sources = []
    const previousObserver = currentObserver
    currentObserver = trackedEffect
    try {
      run()
    } finally {
      currentObserver = previousObserver
    }
  }

  const trackedEffect: TrackedObserver = {
    id,
    isDisposed: () => isDisposed,
    run: execute,
    addSource: unsubscribeSource => {
      sources.push(unsubscribeSource)
    },
  }

  onCleanup(() => {
    isDisposed = true
    for (const unsubscribeSource of sources) {
      unsubscribeSource()
    }
    sources = []
  })

  execute()
}
