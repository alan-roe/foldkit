import { Option } from 'effect'

// OWNER

type OwnerRecord = {
  readonly id: number
  parent: OwnerRecord | undefined
  readonly children: Array<OwnerRecord>
  readonly cleanups: Array<() => void>
  isDisposed: boolean
}

/** A node in the disposal tree. Opaque to callers: created with `makeOwner`,
 *  entered with `runWithOwner`, and torn down with `disposeOwner`. */
export type Owner = OwnerRecord

let nextOwnerId = 0
let currentOwner: Owner | undefined

/** Creates a new `Owner`, attached as a child of `maybeParent` when present.
 *  A parentless owner is a disposal root: nothing disposes it but an
 *  explicit `disposeOwner` call. */
export const makeOwner = (maybeParent: Option.Option<Owner>): Owner => {
  nextOwnerId += 1
  const parent = Option.getOrUndefined(maybeParent)
  const owner: Owner = {
    id: nextOwnerId,
    parent,
    children: [],
    cleanups: [],
    isDisposed: false,
  }
  if (parent !== undefined) {
    parent.children.push(owner)
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
  while (owner.children.length > 0) {
    const child = owner.children.pop()
    if (child !== undefined) {
      disposeOwner(child)
    }
  }
  while (owner.cleanups.length > 0) {
    const cleanup = owner.cleanups.pop()
    if (cleanup !== undefined) {
      cleanup()
    }
  }
  const parent = owner.parent
  if (parent !== undefined) {
    const index = parent.children.indexOf(owner)
    if (index !== -1) {
      parent.children.splice(index, 1)
    }
    owner.parent = undefined
  }
}
