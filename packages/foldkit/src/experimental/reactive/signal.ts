import { Equal } from 'effect'

import { getCurrentObserver } from './effect.js'
import { type SchedulableEffect, markDirty } from './scheduler.js'

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
  const subscribers = new Set<SchedulableEffect>()

  const read = (): A => {
    const observer = getCurrentObserver()
    if (observer !== undefined && !subscribers.has(observer)) {
      subscribers.add(observer)
      observer.addSource(() => subscribers.delete(observer))
    }
    return value
  }

  const peek = (): A => value

  const write = (next: A): void => {
    if (equivalence(value, next)) {
      return
    }
    value = next
    for (const subscriber of subscribers) {
      markDirty(subscriber)
    }
  }

  return { read, peek, write }
}
