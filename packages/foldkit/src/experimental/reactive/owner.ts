import { Option } from 'effect'

// OWNER

type OwnerRecord = {
  readonly id: number
  parent: OwnerRecord | undefined
  firstChild: OwnerRecord | undefined
  lastChild: OwnerRecord | undefined
  prevSibling: OwnerRecord | undefined
  nextSibling: OwnerRecord | undefined
  readonly cleanups: Array<() => void>
  isDisposed: boolean
}

/** A node in the disposal tree. Opaque to callers: created with `makeOwner`,
 *  entered with `runWithOwner`, and torn down with `disposeOwner`. */
export type Owner = OwnerRecord

let nextOwnerId = 0
let currentOwner: Owner | undefined

// SIBLING LIST

// Children are an intrusive doubly-linked sibling list rather than an
// array: `attachChild`/`detachChild` are O(1) regardless of how many
// siblings exist, so disposing many short-lived owners (e.g. list rows)
// under one long-lived parent never degrades to O(n) per disposal. New
// children are prepended, so `firstChild` is always the newest -
// `disposeOwner` walking head-to-tail reproduces the prior newest-first
// order.

const attachChild = (parent: OwnerRecord, child: OwnerRecord): void => {
  child.nextSibling = parent.firstChild
  if (parent.firstChild !== undefined) {
    parent.firstChild.prevSibling = child
  }
  parent.firstChild = child
  if (parent.lastChild === undefined) {
    parent.lastChild = child
  }
}

const detachChild = (parent: OwnerRecord, child: OwnerRecord): void => {
  if (child.prevSibling !== undefined) {
    child.prevSibling.nextSibling = child.nextSibling
  } else {
    parent.firstChild = child.nextSibling
  }
  if (child.nextSibling !== undefined) {
    child.nextSibling.prevSibling = child.prevSibling
  } else {
    parent.lastChild = child.prevSibling
  }
  child.prevSibling = undefined
  child.nextSibling = undefined
}

/** Creates a new `Owner`, attached as a child of `maybeParent` when present.
 *  A parentless owner is a disposal root: nothing disposes it but an
 *  explicit `disposeOwner` call. */
export const makeOwner = (maybeParent: Option.Option<Owner>): Owner => {
  nextOwnerId += 1
  const parent = Option.getOrUndefined(maybeParent)
  const owner: Owner = {
    id: nextOwnerId,
    parent,
    firstChild: undefined,
    lastChild: undefined,
    prevSibling: undefined,
    nextSibling: undefined,
    cleanups: [],
    isDisposed: false,
  }
  if (parent !== undefined) {
    attachChild(parent, owner)
  }
  return owner
}

/** Runs `body` with `owner` as the ambient current owner, restoring the
 *  previous ambient owner afterward even if `body` throws. `onCleanup`
 *  called anywhere during `body` (including transitively, through nested
 *  synchronous calls) registers against `owner`. */
export const runWithOwner = <A>(owner: Owner, body: () => A): A => {
  const previousOwner = currentOwner
  currentOwner = owner
  try {
    return body()
  } finally {
    currentOwner = previousOwner
  }
}

/** The ambient current owner, if any owner scope is active. */
export const getCurrentOwner = (): Option.Option<Owner> =>
  Option.fromUndefinedOr(currentOwner)

/** Registers `cleanup` to run when the ambient current owner is disposed.
 *  A no-op when no owner scope is active. */
export const onCleanup = (cleanup: () => void): void => {
  if (currentOwner === undefined) {
    return
  }
  currentOwner.cleanups.push(cleanup)
}

/** Disposes `owner`: children depth-first (newest first), then `owner`'s own
 *  cleanups, then detachment from its parent. Idempotent: disposing an
 *  already-disposed owner is a no-op. */
export const disposeOwner = (owner: Owner): void => {
  if (owner.isDisposed) {
    return
  }
  owner.isDisposed = true
  let child = owner.firstChild
  owner.firstChild = undefined
  owner.lastChild = undefined
  while (child !== undefined) {
    const next = child.nextSibling
    child.prevSibling = undefined
    child.nextSibling = undefined
    // The child's slot in `owner`'s list was already unlinked above (the
    // whole list was cut loose in one step), so clear its parent pointer
    // too: the recursive `disposeOwner` below then skips the now-redundant
    // per-child `detachChild` at its own tail.
    child.parent = undefined
    disposeOwner(child)
    child = next
  }
  while (owner.cleanups.length > 0) {
    const cleanup = owner.cleanups.pop()
    if (cleanup !== undefined) {
      cleanup()
    }
  }
  const parent = owner.parent
  if (parent !== undefined) {
    detachChild(parent, owner)
    owner.parent = undefined
  }
}
