// SCHEDULABLE EFFECT

/** The minimal shape the scheduler needs from a render effect: a stable
 *  creation-order `id`, a disposal check, and the run callback itself. Owned
 *  and constructed by `effect.ts`; the scheduler never creates one. */
export type SchedulableEffect = Readonly<{
  id: number
  isDisposed: () => boolean
  run: () => void
}>

// SCHEDULER

const FLUSH_PASS_CAP = 10_000

let dirtyEffects = new Map<number, SchedulableEffect>()
let isFlushing = false

/** Marks a render effect dirty. Does not run it: the effect runs on the next
 *  `flush()`. Marking the same effect dirty more than once before a flush
 *  drains it collapses to a single scheduled run. */
export const markDirty = (effect: SchedulableEffect): void => {
  dirtyEffects.set(effect.id, effect)
}

/** True while at least one render effect is scheduled and has not yet run. */
export const isDirty = (): boolean => dirtyEffects.size > 0

/**
 * Drains the dirty set, running each scheduled effect at most once per pass
 * in creation order. Effects that dirty further effects while running cause
 * another pass over the newly dirtied set, in the same `flush()` call, until
 * the dirty set is empty. A `flush()` call re-entered from within a running
 * effect is a no-op: the outer call already owns the drain loop and will
 * pick up the newly dirtied effects on its next pass.
 *
 * Throws if the cascade does not settle within `FLUSH_PASS_CAP` passes.
 */
export const flush = (): void => {
  if (isFlushing) {
    return
  }
  isFlushing = true
  let passCount = 0
  try {
    while (dirtyEffects.size > 0) {
      passCount += 1
      if (passCount > FLUSH_PASS_CAP) {
        throw new Error('flush did not settle')
      }
      const pass = Array.from(dirtyEffects.values()).sort(
        (effectA, effectB) => effectA.id - effectB.id,
      )
      dirtyEffects.clear()
      for (const effect of pass) {
        if (effect.isDisposed()) {
          continue
        }
        effect.run()
      }
    }
  } finally {
    isFlushing = false
    dirtyEffects.clear()
  }
}
