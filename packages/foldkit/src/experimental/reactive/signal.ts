import { Equal } from 'effect'

import {
  type SubscriberHost,
  getCurrentObserver,
  linkSource,
} from './effect.js'
import { markDirty } from './scheduler.js'

// SIGNAL

/** A same-type equality check: `true` when `self` and `that` should be
 *  treated as the same value for the purposes of skipping a write. */
export type Equivalence<A> = (self: A, that: A) => boolean

/** A single reactive cell. `read` registers a dependency when called while a
 *  render effect is running; `peek` never does; `write` never runs effects
 *  inline, only marks subscribers dirty for the next `scheduler.flush()`. */
export type Signal<A> = Readonly<{
  read: () => A
  peek: () => A
  write: (next: A) => void
}>

/** Walks `host`'s subscriber list, notifying each subscriber that its
 *  source changed: a `derived.ts` computed (its `Link.effect.markStale` is
 *  present) gets stale-marked instead of scheduled, so staleness forwards
 *  through computed chains without ever entering the scheduler; every
 *  other subscriber gets `markDirty`d for the next `scheduler.flush()`.
 *  Shared by every `Signal.write` and by a computed's own stale-forward,
 *  so both notification paths stay in lockstep. */
export const notifySubscribers = (host: SubscriberHost): void => {
  let link = host.subsHead
  while (link !== undefined) {
    const subscriber = link.effect
    if (subscriber.markStale !== undefined) {
      subscriber.markStale()
    } else {
      markDirty(subscriber)
    }
    link = link.nextSub
  }
}

/**
 * Creates a `Signal` holding `initial`. `equivalence` decides whether a
 * `write` is a no-op; it defaults to Effect's structural `Equal.equals`, so
 * a freshly-allocated but value-equal `Option`, `Data`, or Schema class
 * instance never fires subscribers.
 */
export const makeSignal = <A>(
  initial: A,
  equivalence: Equivalence<A> = Equal.equals,
): Signal<A> => {
  let value = initial
  const host: SubscriberHost = { subsHead: undefined, subsTail: undefined }

  const read = (): A => {
    const observer = getCurrentObserver()
    if (observer !== undefined) {
      linkSource(observer, host)
    }
    return value
  }

  const peek = (): A => value

  const write = (next: A): void => {
    if (equivalence(value, next)) {
      return
    }
    value = next
    notifySubscribers(host)
  }

  return { read, peek, write }
}
