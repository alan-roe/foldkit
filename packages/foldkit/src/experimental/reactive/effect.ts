import { onCleanup } from './owner.js'
import type { SchedulableEffect } from './scheduler.js'

// LINK

/** One reactive edge between a `Signal` and a subscribing render effect.
 *  Intrusively double-linked into both the signal's subscriber list
 *  (`prevSub`/`nextSub`) and the effect's source list (`prevSource`/
 *  `nextSource`): a single allocation per (signal, effect) dependency per
 *  effect run, detached from both lists in O(1) with no search or hashing. */
export type Link = {
  readonly effect: TrackedObserver
  readonly host: SubscriberHost
  prevSource: Link | undefined
  nextSource: Link | undefined
  prevSub: Link | undefined
  nextSub: Link | undefined
}

/** The subscriber-list head/tail a `Signal` exposes to the tracking
 *  machinery. Every `Signal` owns exactly one of these; `linkSource`
 *  appends, `clearSources` (via the effect side) detaches. */
export type SubscriberHost = {
  subsHead: Link | undefined
  subsTail: Link | undefined
}

// OBSERVER

/** The ambient tracking scope a signal read registers against: the running
 *  render effect. Carries its own source-list head/tail so dependencies
 *  collected on one run can be cleared in O(1) per edge on the next.
 *  `markStale`, when present, marks this observer as a `derived.ts`
 *  computed node: `signal.ts`'s write-time subscriber walk calls it
 *  instead of `markDirty` so a stale computed forwards dirtiness to its
 *  own subscribers without entering the scheduler. */
export type TrackedObserver = SchedulableEffect & {
  sourcesHead: Link | undefined
  sourcesTail: Link | undefined
  markStale?: () => void
}

let currentObserver: TrackedObserver | undefined
let nextEffectId = 0

/** The render effect currently running, if any. `signal.ts` reads this to
 *  decide whether a read should register a dependency. `undefined` outside
 *  any render effect: reads are plain, untracked reads. */
export const getCurrentObserver = (): TrackedObserver | undefined =>
  currentObserver

/** Runs `body` with `observer` as the ambient tracked observer, restoring
 *  the previous observer afterward even if `body` throws. `derived.ts`'s
 *  computed nodes are pull-based (evaluated from `read()`, never from a
 *  scheduler pass), so they cannot install themselves via
 *  `makeRenderEffect`; this is the one seam that lets them evaluate `f`
 *  under tracking, mirroring `execute`'s save/restore below. */
export const runWithObserver = <A>(
  observer: TrackedObserver,
  body: () => A,
): A => {
  const previousObserver = currentObserver
  currentObserver = observer
  try {
    return body()
  } finally {
    currentObserver = previousObserver
  }
}

/** Registers a dependency: appends a fresh `Link` to the tail of both
 *  `observer`'s source list and `host`'s subscriber list. Called from
 *  `signal.ts` on every tracked read; no de-duplication against repeat
 *  reads of the same signal within one run - a harmless duplicate edge
 *  that `clearSources` unlinks like any other on the next run. */
export const linkSource = (
  observer: TrackedObserver,
  host: SubscriberHost,
): void => {
  const link: Link = {
    effect: observer,
    host,
    prevSource: observer.sourcesTail,
    nextSource: undefined,
    prevSub: host.subsTail,
    nextSub: undefined,
  }
  if (observer.sourcesTail !== undefined) {
    observer.sourcesTail.nextSource = link
  }
  observer.sourcesTail = link
  if (observer.sourcesHead === undefined) {
    observer.sourcesHead = link
  }
  if (host.subsTail !== undefined) {
    host.subsTail.nextSub = link
  }
  host.subsTail = link
  if (host.subsHead === undefined) {
    host.subsHead = link
  }
}

const unlinkFromHost = (link: Link): void => {
  const host = link.host
  if (link.prevSub !== undefined) {
    link.prevSub.nextSub = link.nextSub
  } else {
    host.subsHead = link.nextSub
  }
  if (link.nextSub !== undefined) {
    link.nextSub.prevSub = link.prevSub
  } else {
    host.subsTail = link.prevSub
  }
}

const clearSources = (observer: TrackedObserver): void => {
  let link = observer.sourcesHead
  while (link !== undefined) {
    const next = link.nextSource
    unlinkFromHost(link)
    link.prevSource = undefined
    link.nextSource = undefined
    link = next
  }
  observer.sourcesHead = undefined
  observer.sourcesTail = undefined
}

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
  let isDisposed = false

  const execute = (): void => {
    if (isDisposed) {
      return
    }
    clearSources(trackedEffect)
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
    sourcesHead: undefined,
    sourcesTail: undefined,
  }

  onCleanup(() => {
    isDisposed = true
    clearSources(trackedEffect)
  })

  execute()
}
