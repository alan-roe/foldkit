import { Option } from 'effect'

import { getCurrentObserver } from './effect.js'
import { type Owner, disposeOwner, makeOwner } from './owner.js'
import { type Signal, makeSignal } from './signal.js'

// STORE

/** A reactive materialized view over an immutable TEA Model. `view` is a
 *  deep readonly proxy: reading a plain record field returns a nested proxy,
 *  cached so repeated reads share identity; reading any other field (array,
 *  `Option`, `Data`/Schema instance, primitive, function) returns the value
 *  itself and, only when read inside a render effect, allocates a per-key
 *  signal lazily. `reconcile` is the store's single writer. */
export type ModelStore<Model extends object> = Readonly<{
  view: Model
  reconcile: (next: Model) => void
  dispose: () => void
}>

// NODE

type StoreNode = {
  raw: object
  readonly signals: Map<PropertyKey, Signal<unknown>>
  readonly children: Map<PropertyKey, StoreNode>
  readonly owner: Owner
  proxy: object
}

const nodeByProxy = new WeakMap<object, StoreNode>()

const isPlainRecord = (
  value: unknown,
): value is Record<PropertyKey, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

// PROXY

const readLeaf = (
  node: StoreNode,
  key: PropertyKey,
  value: unknown,
): unknown => {
  const existingSignal = node.signals.get(key)
  const tracked = getCurrentObserver() !== undefined
  if (existingSignal !== undefined) {
    return tracked ? existingSignal.read() : existingSignal.peek()
  }
  if (!tracked) {
    return value
  }
  const signal = makeSignal(value)
  node.signals.set(key, signal)
  return signal.read()
}

const readChild = (
  node: StoreNode,
  key: PropertyKey,
  value: Record<PropertyKey, unknown>,
): object => {
  const existingChild = node.children.get(key)
  if (existingChild !== undefined) {
    return existingChild.proxy
  }
  const child = makeNode(value, node.owner)
  node.children.set(key, child)
  return child.proxy
}

const storeHandler: ProxyHandler<StoreNode> = {
  get: (node, key) => {
    const raw = node.raw as Record<PropertyKey, unknown>
    const value = raw[key]
    if (isPlainRecord(value)) {
      return readChild(node, key, value)
    }
    return readLeaf(node, key, value)
  },
  set: () => {
    throw new Error('ModelStore.view is read-only; write via reconcile()')
  },
  deleteProperty: () => {
    throw new Error('ModelStore.view is read-only; write via reconcile()')
  },
  defineProperty: () => {
    throw new Error('ModelStore.view is read-only; write via reconcile()')
  },
  has: (node, key) => Reflect.has(node.raw, key),
  ownKeys: node => Reflect.ownKeys(node.raw),
  getOwnPropertyDescriptor: (node, key) => {
    if (!Reflect.has(node.raw, key)) {
      return undefined
    }
    return {
      value: storeHandler.get?.(node, key, node.proxy),
      writable: false,
      enumerable: true,
      configurable: true,
    }
  },
}

// NOTE: `node` and its `proxy` are circularly self-referential (the proxy
// handler closes over `node` to always read the current `raw`). The object
// literal is built without `proxy`, then completed by direct assignment
// before `node` is returned or read anywhere else.
const makeNode = (raw: object, owner: Owner): StoreNode => {
  const node = {
    raw,
    signals: new Map<PropertyKey, Signal<unknown>>(),
    children: new Map<PropertyKey, StoreNode>(),
    owner,
  } as StoreNode
  node.proxy = new Proxy(node, storeHandler)
  nodeByProxy.set(node.proxy, node)
  return node
}

// RECONCILE

const reconcileNode = (node: StoreNode, nextRaw: object): void => {
  const prevRaw = node.raw as Record<PropertyKey, unknown>
  if (nextRaw === node.raw) {
    return
  }
  node.raw = nextRaw
  const nextRawRecord = nextRaw as Record<PropertyKey, unknown>

  for (const [key, signal] of node.signals) {
    const prevValue = prevRaw[key]
    const nextValue = nextRawRecord[key]
    if (prevValue === nextValue) {
      continue
    }
    signal.write(nextValue)
  }

  for (const [key, child] of node.children) {
    const prevValue = prevRaw[key]
    const nextValue = nextRawRecord[key]
    if (prevValue === nextValue) {
      continue
    }
    if (isPlainRecord(prevValue) && isPlainRecord(nextValue)) {
      reconcileNode(child, nextValue)
    }
  }
}

const disposeNode = (node: StoreNode): void => {
  nodeByProxy.delete(node.proxy)
  for (const child of node.children.values()) {
    disposeNode(child)
  }
  node.signals.clear()
  node.children.clear()
}

/**
 * Creates a `ModelStore` over `initial`. `view` proxies `initial` lazily:
 * nothing is allocated until a field is read, and no signal is allocated
 * until a field is read inside a render effect. `reconcile` is the only
 * writer, walking allocated signals and child nodes only (never the whole
 * Model) and firing a signal iff its value changed by `Equal.equals`;
 * reconcile never runs `scheduler.flush()` itself.
 */
export const makeModelStore = <Model extends object>(
  initial: Model,
): ModelStore<Model> => {
  const owner = makeOwner(Option.none())
  const root = makeNode(initial, owner)
  return {
    view: root.proxy as Model,
    reconcile: (next: Model): void => {
      reconcileNode(root, next)
    },
    dispose: (): void => {
      disposeNode(root)
      disposeOwner(owner)
    },
  }
}

/** The `Owner` that owns every `derived.ts` computed lazily allocated for
 *  `proxyOrNestedProxy`'s store, regardless of which node in the store's
 *  tree the computed was keyed against: every computed in a store shares
 *  the store's one root `Owner`, so store teardown disposes them all in
 *  one pass. `undefined` when `proxyOrNestedProxy` is not a store proxy -
 *  the same miss `derived.ts` treats as its raw-fallback signal. */
export const getStoreOwner = (proxyOrNestedProxy: object): Owner | undefined =>
  nodeByProxy.get(proxyOrNestedProxy)?.owner

// TESTING

/** Test-only seam: counts every per-key `Signal` allocated so far under
 *  `proxyOrNestedProxy`, which may be `store.view` or any nested record
 *  field of it. Never used by application or engine code. */
export const __testingAllocatedSignalCount = (
  proxyOrNestedProxy: object,
): number => {
  const node = nodeByProxy.get(proxyOrNestedProxy)
  if (node === undefined) {
    return 0
  }
  return countSignals(node)
}

const countSignals = (node: StoreNode): number => {
  let total = node.signals.size
  for (const child of node.children.values()) {
    total += countSignals(child)
  }
  return total
}
