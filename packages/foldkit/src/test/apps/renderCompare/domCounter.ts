// COUNTS

/**
 * Per-category counts of actual DOM mutation calls observed since the last
 * {@link installDomCounter} `reset`. `moves` is always `0`: `insertBefore`
 * cannot distinguish a fresh insert from repositioning an existing node, so
 * both a create and a reorder increment `insertions`. `total` sums every
 * other field.
 */
export type DomCounts = Readonly<{
  attributeWrites: number
  textWrites: number
  insertions: number
  removals: number
  moves: number
  total: number
}>

/** The handle {@link installDomCounter} returns. */
export type DomCounter = Readonly<{
  read: () => DomCounts
  reset: () => void
  uninstall: () => void
}>

// INSTALL

/**
 * Patches DOM-mutating prototype methods on `window` to count actual calls,
 * so the same counter measures both the snabbdom baseline and the
 * fine-grained renderer identically:
 *
 * - `Element.prototype.setAttribute` / `removeAttribute` -> `attributeWrites`
 * - `Node.prototype.appendChild` / `insertBefore` -> `insertions`
 * - `Node.prototype.removeChild` -> `removals`
 * - `Node.prototype.replaceChild` -> one `removals` and one `insertions`. Not
 *   counted directly: happy-dom implements it in terms of `insertBefore` and
 *   `removeChild`, both already patched, so delegating to the original call
 *   produces the right counts without double-booking.
 * - the `Element.prototype.textContent` setter -> `textWrites`. Patched on
 *   `Element`, not `Node`: happy-dom defines its own `textContent` on both
 *   `Element.prototype` and `CharacterData.prototype`, shadowing whatever
 *   sits on `Node.prototype`, so patching `Node.prototype` would never run.
 * - the `CharacterData.prototype.data` setter -> `textWrites`. Also covers
 *   `CharacterData.prototype.textContent`, which happy-dom implements as
 *   `this.data = textContent`.
 *
 * `uninstall` restores every original method and descriptor exactly, so a
 * test suite can install and uninstall around each case without leaking
 * counting behavior into unrelated tests.
 */
export const installDomCounter = (
  window: Window & typeof globalThis,
): DomCounter => {
  let attributeWrites = 0
  let textWrites = 0
  let insertions = 0
  let removals = 0

  const elementProto = window.Element.prototype
  const nodeProto = window.Node.prototype
  const characterDataProto = window.CharacterData.prototype

  const originalSetAttribute = elementProto.setAttribute
  const originalRemoveAttribute = elementProto.removeAttribute
  const originalAppendChild = nodeProto.appendChild
  const originalInsertBefore = nodeProto.insertBefore
  const originalRemoveChild = nodeProto.removeChild
  const originalReplaceChild = nodeProto.replaceChild

  const textContentDescriptor = Object.getOwnPropertyDescriptor(
    elementProto,
    'textContent',
  )
  const dataDescriptor = Object.getOwnPropertyDescriptor(
    characterDataProto,
    'data',
  )

  if (
    textContentDescriptor === undefined ||
    textContentDescriptor.set === undefined
  ) {
    throw new Error(
      'installDomCounter: no textContent setter on Element.prototype',
    )
  }
  if (dataDescriptor === undefined || dataDescriptor.set === undefined) {
    throw new Error(
      'installDomCounter: no data setter on CharacterData.prototype',
    )
  }

  const originalTextContentSet = textContentDescriptor.set
  const originalDataSet = dataDescriptor.set

  elementProto.setAttribute = function (
    this: Element,
    qualifiedName: string,
    value: string,
  ): void {
    attributeWrites += 1
    originalSetAttribute.call(this, qualifiedName, value)
  }

  elementProto.removeAttribute = function (
    this: Element,
    qualifiedName: string,
  ): void {
    attributeWrites += 1
    originalRemoveAttribute.call(this, qualifiedName)
  }

  /* eslint-disable @typescript-eslint/consistent-type-assertions */
  nodeProto.appendChild = function (this: Node, node: Node): Node {
    insertions += 1
    return originalAppendChild.call(this, node)
  } as typeof originalAppendChild

  nodeProto.insertBefore = function (
    this: Node,
    node: Node,
    child: Node | null,
  ): Node {
    insertions += 1
    return originalInsertBefore.call(this, node, child)
  } as typeof originalInsertBefore

  nodeProto.removeChild = function (this: Node, child: Node): Node {
    removals += 1
    return originalRemoveChild.call(this, child)
  } as typeof originalRemoveChild

  nodeProto.replaceChild = function (
    this: Node,
    node: Node,
    child: Node,
  ): Node {
    return originalReplaceChild.call(this, node, child)
  } as typeof originalReplaceChild
  /* eslint-enable @typescript-eslint/consistent-type-assertions */

  Object.defineProperty(elementProto, 'textContent', {
    ...textContentDescriptor,
    set(this: Element, value: string | null) {
      textWrites += 1
      originalTextContentSet.call(this, value)
    },
  })

  Object.defineProperty(characterDataProto, 'data', {
    ...dataDescriptor,
    set(this: CharacterData, value: string) {
      textWrites += 1
      originalDataSet.call(this, value)
    },
  })

  const read = (): DomCounts => ({
    attributeWrites,
    textWrites,
    insertions,
    removals,
    moves: 0,
    total: attributeWrites + textWrites + insertions + removals,
  })

  const reset = (): void => {
    attributeWrites = 0
    textWrites = 0
    insertions = 0
    removals = 0
  }

  const uninstall = (): void => {
    elementProto.setAttribute = originalSetAttribute
    elementProto.removeAttribute = originalRemoveAttribute
    nodeProto.appendChild = originalAppendChild
    nodeProto.insertBefore = originalInsertBefore
    nodeProto.removeChild = originalRemoveChild
    nodeProto.replaceChild = originalReplaceChild
    Object.defineProperty(elementProto, 'textContent', textContentDescriptor)
    Object.defineProperty(characterDataProto, 'data', dataDescriptor)
  }

  return { read, reset, uninstall }
}
