import {
  type Link,
  type SubscriberHost,
  type TrackedObserver,
  getCurrentObserver,
  linkSource,
  runWithObserver,
} from './effect.js'
import type { Owner } from './owner.js'
import { onCleanup, runWithOwner } from './owner.js'
import { notifySubscribers } from './signal.js'
import { getStoreOwner } from './store.js'

// COMPUTED

/** A pull-based derivation node: `read()` returns the cached value,
 *  recomputing first iff `stale`. Never scheduled into `scheduler.flush()`;
 *  see `markStale` on `TrackedObserver` for how staleness reaches it. */
type Computed<A> = Readonly<{
  read: () => A
}>

let nextComputedId = 0

const detachFromHost = (link: Link): void => {
  if (link.prevSub !== undefined) {
    link.prevSub.nextSub = link.nextSub
  } else {
    link.host.subsHead = link.nextSub
  }
  if (link.nextSub !== undefined) {
    link.nextSub.prevSub = link.prevSub
  } else {
    link.host.subsTail = link.prevSub
  }
}

// `TrackedObserver`'s own source list (its dependencies) is intrusively
// linked the same way a `Signal`'s subscriber list is; a computed clears
// it on every recompute and on disposal. Duplicated from `effect.ts`
// rather than imported: `effect.ts` exposes only the `Link` shape (its
// fields are mutable on purpose for exactly this), not the private
// `clearSources` that walks it, since a computed's own dependency list is
// this module's concern, not `effect.ts`'s.
const clearComputedSources = (observer: TrackedObserver): void => {
  let link = observer.sourcesHead
  while (link !== undefined) {
    const next = link.nextSource
    detachFromHost(link)
    link.prevSource = undefined
    link.nextSource = undefined
    link = next
  }
  observer.sourcesHead = undefined
  observer.sourcesTail = undefined
}

const makeComputed = <Model extends object, A>(
  f: (model: Model) => A,
  view: Model,
  storeOwner: Owner,
): Computed<A> => {
  nextComputedId += 1
  const id = nextComputedId
  const host: SubscriberHost = { subsHead: undefined, subsTail: undefined }
  let stale = true
  let disposed = false
  // A computed always recomputes before its first read (`stale` starts
  // `true`), so `value` is written before any caller can observe it; the
  // non-null assertion below never runs against the uninitialized state.
  let value: A | undefined

  const markStale = (): void => {
    if (stale) {
      return
    }
    stale = true
    notifySubscribers(host)
  }

  const observer: TrackedObserver = {
    id,
    isDisposed: () => disposed,
    run: () => {},
    sourcesHead: undefined,
    sourcesTail: undefined,
    markStale,
  }

  runWithOwner(storeOwner, () => {
    onCleanup(() => {
      disposed = true
      clearComputedSources(observer)
    })
  })

  const recompute = (): void => {
    clearComputedSources(observer)
    value = runWithObserver(observer, () => f(view))
    stale = false
  }

  const read = (): A => {
    if (stale) {
      recompute()
    }
    const reader = getCurrentObserver()
    if (reader !== undefined) {
      linkSource(reader, host)
    }
    // `value` is set by the unconditional recompute above whenever
    // `stale`, and only ever cleared back to `stale = true` (never to
    // `undefined`), so it always holds the last computed `A` here.
    return value as A
  }

  return { read }
}

// REGISTRY

// Keyed by the exact view-proxy identity `derived.ts` was called with,
// not the store root: the same child-typed `g` lifted through two `Sub`
// instances selecting different children owns two computeds, one per
// child proxy. Both levels are `WeakMap`/`Map` so an unreachable proxy or
// a garbage-collected `g` reclaims its computeds for free.
const registry = new WeakMap<object, Map<object, Computed<unknown>>>()

let hasMountCompleted = false

/** Marks the first bind-path mount as complete: called once, at the end of
 *  `bind/render.ts`'s `mount()`. `derived()` warns instead of throwing for
 *  every creation-time observer check that happens after this flips,
 *  since code-split chunks legitimately declare deriveds at module load
 *  after the initial mount. */
export const __markBindMountComplete = (): void => {
  hasMountCompleted = true
}

/**
 * Declares a derivation shared by every reader: `derived(f)` returns a
 * function `g` structurally compatible with `Bound<Model, A>` (usable
 * anywhere a `Bound` is - `list`, `text`, another `derived` body - without
 * importing bind types into the reactive layer).
 *
 * `g(view)` over a store proxy allocates (once) or reuses a pull-based
 * computed keyed by `(view, g)`: a dependency write marks it stale and
 * forwards staleness to its own subscribers immediately, but `f` only
 * re-runs on the next `read()`, and re-runs at most once regardless of how
 * many holes read `g` for that Model change. `g(view)` over a plain object
 * (materialize, tests, a `Sub.select` that crossed a leaf boundary) calls
 * `f` directly with no caching - the same function stays referentially
 * transparent everywhere a plain `Bound` would be.
 *
 * **Must be declared at module scope**, next to the Model it derives from
 * - never inside a view body, `renderItem`, or any other thunk. Calling it
 * from inside a running render effect throws immediately; calling it after
 * the first bind-path mount has completed warns. Either way the fix is the
 * same: hoist the `derived(...)` call to module scope so `g` is created
 * once and reused, not once per call site per row.
 *
 * @example
 * ```ts
 * // Module scope, next to Model:
 * const filteredTodos = derived((model: Model) =>
 *   filterTodos(model.todos, model.filter),
 * )
 *
 * // Used at any Bound position, and shared across every reader below:
 * list(filteredTodos, todo => todo.id, renderTodoRow)
 * text(model => String(Array.length(filteredTodos(model))))
 * ```
 */
export const derived = <Model, A>(
  f: (model: Model) => A,
): ((model: Model) => A) => {
  if (getCurrentObserver() !== undefined) {
    throw new Error(
      '[foldkit] derived() was called while a render effect is running. ' +
        'derived() must be declared at module scope, next to the Model it ' +
        'derives from - calling it from inside a view body or renderItem ' +
        'allocates a fresh, permanently-owned computed on every run.',
    )
  }
  if (hasMountCompleted) {
    console.warn(
      '[foldkit] derived() was called after the first bind-path mount ' +
        'completed. If this is a code-split chunk declaring its derived ' +
        'values at module load, this is expected and safe to ignore. ' +
        'Otherwise, declare derived at module scope so it runs once, not ' +
        'once per call site.',
    )
  }

  const g = (model: Model): A => {
    if (typeof model !== 'object' || model === null) {
      return f(model)
    }
    const storeOwner = getStoreOwner(model)
    if (storeOwner === undefined) {
      return f(model)
    }
    let byG = registry.get(model)
    if (byG === undefined) {
      byG = new Map<object, Computed<unknown>>()
      registry.set(model, byG)
    }
    let computed = byG.get(g)
    if (computed === undefined) {
      computed = makeComputed(f, model, storeOwner)
      byG.set(g, computed)
    }
    return computed.read() as A
  }

  return g
}

// TESTING

/** Test-only seam: counts every computed allocated so far for the exact
 *  proxy identity `proxyOrNestedProxy` (across every `derived()` closure
 *  read against it), mirroring `__testingAllocatedSignalCount`'s shape and
 *  intent. Never used by application or engine code. */
export const __testingAllocatedComputedCount = (
  proxyOrNestedProxy: object,
): number => registry.get(proxyOrNestedProxy)?.size ?? 0
