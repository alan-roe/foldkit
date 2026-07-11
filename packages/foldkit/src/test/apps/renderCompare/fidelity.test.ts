import { Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { type Binding } from '../../../experimental/bind/binding.js'
import {
  type MaterializedNode,
  materialize,
} from '../../../experimental/bind/materialize.js'
import { mount } from '../../../experimental/bind/render.js'
import { flush } from '../../../experimental/reactive/scheduler.js'
import {
  type ModelStore,
  makeModelStore,
} from '../../../experimental/reactive/store.js'
import { type VNode, __patchVNode } from '../../../vdom.js'
import {
  AddedTodos,
  ClearedTodos,
  type Message,
  type Model,
  RetitledTodo,
  ReversedTodos,
  ToggledTodo,
  initialModel,
  update,
} from './app.js'
import { view as viewBoundFactory } from './viewBound.js'
import { view as viewSnabbdom } from './viewSnabbdom.js'

// NORMALIZATION
//
// Old path (snabbdom) reflects `checked` as a live DOM *property* (via
// `propsModule`), never as an HTML attribute. New path (fine-grained
// renderer) reflects it as an attribute, per the `Attr` binding contract.
// A fresh checkbox's `.checked` IDL property mirrors whichever the
// implementation used, so reading the property universally (and dropping
// any literal `checked` attribute text) normalizes both paths to the same
// shape. Comment nodes are the fine-grained renderer's `Cond` anchors and
// carry no content, so both serializers drop them.

const collapseWhitespace = (text: string): string =>
  text.replace(/\s+/g, ' ').trim()

const serializeDomNode = (node: Node): string => {
  if (node.nodeType === Node.COMMENT_NODE) {
    return ''
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return collapseWhitespace(node.textContent ?? '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  const attrPairs: Array<string> = []
  for (const name of element.getAttributeNames()) {
    if (name === 'checked') {
      continue
    }
    const value = element.getAttribute(name) ?? ''
    // snabbdom's classModule omits the `class` attribute entirely when the
    // class string is empty, rather than setting `class=""`; an empty
    // attribute value is functionally equivalent to the attribute being
    // absent, so both are normalized away here.
    if (value === '') {
      continue
    }
    attrPairs.push(`${name}="${value}"`)
  }
  if (element instanceof HTMLInputElement && element.checked) {
    attrPairs.push('checked=""')
  }
  attrPairs.sort()
  const attrsText = attrPairs.length > 0 ? ` ${attrPairs.join(' ')}` : ''
  const childrenText = Array.from(element.childNodes)
    .map(serializeDomNode)
    .join('')
  return `<${tag}${attrsText}>${childrenText}</${tag}>`
}

const serializeContainer = (container: Element): string =>
  Array.from(container.childNodes).map(serializeDomNode).join('')

const serializeMaterialized = (node: MaterializedNode): string => {
  if (node._tag === 'MaterializedText') {
    return collapseWhitespace(node.text)
  }
  const attrPairs: Array<string> = []
  for (const [name, value] of Object.entries(node.attrs)) {
    if (typeof value === 'boolean') {
      if (value) {
        attrPairs.push(`${name}=""`)
      }
    } else if (value !== '') {
      attrPairs.push(`${name}="${value}"`)
    }
  }
  attrPairs.sort()
  const attrsText = attrPairs.length > 0 ? ` ${attrPairs.join(' ')}` : ''
  const childrenText = node.children.map(serializeMaterialized).join('')
  return `<${node.tag}${attrsText}>${childrenText}</${node.tag}>`
}

// SCRIPT
//
// Deterministic, no randomness: AddedTodos -> ToggledTodo(several) ->
// RetitledTodo(2 ids) -> ReversedTodos -> ClearedTodos -> AddedTodos.

const script: ReadonlyArray<Message> = [
  AddedTodos({ count: 50 }),
  ToggledTodo({ id: 'todo-0' }),
  ToggledTodo({ id: 'todo-7' }),
  ToggledTodo({ id: 'todo-25' }),
  ToggledTodo({ id: 'todo-49' }),
  RetitledTodo({ id: 'todo-3', title: 'Renamed todo 3' }),
  RetitledTodo({ id: 'todo-40', title: 'Renamed todo 40' }),
  ReversedTodos(),
  ClearedTodos(),
  AddedTodos({ count: 10 }),
]

// SUITE

describe('fidelity: snabbdom baseline vs fine-grained renderer', () => {
  let oldContainer: HTMLElement | undefined
  let newContainer: HTMLElement | undefined
  let store: ModelStore<Model> | undefined
  let mounted: Readonly<{ dispose: () => void }> | undefined

  afterEach(() => {
    mounted?.dispose()
    store?.dispose()
    oldContainer?.remove()
    newContainer?.remove()
    mounted = undefined
    store = undefined
    oldContainer = undefined
    newContainer = undefined
  })

  it('stays DOM-equivalent to the snabbdom baseline at every step, and materialize() agrees', () => {
    oldContainer = document.createElement('div')
    newContainer = document.createElement('div')
    document.body.appendChild(oldContainer)
    document.body.appendChild(newContainer)

    let oldModel: Model = initialModel
    let newModel: Model = initialModel
    let maybeCurrentVNode: Option.Option<VNode> = Option.none()

    // `__patchVNode(toVNode(container), rootVNode)` diffs the container
    // element itself against the root vnode. Since the container is a
    // plain `div` and the root is a `section`, the tags never match, so
    // snabbdom REPLACES the container in its parent with the new root
    // element rather than inserting inside it (mirrors runtime.ts's own
    // usage). The live root is therefore `vnode.elm`, not
    // `oldContainer.childNodes` - oldContainer itself is discarded after
    // the first patch.
    const patchOld = (model: Model): void => {
      const nextDocument = viewSnabbdom(model)
      maybeCurrentVNode = Option.some(
        __patchVNode(
          maybeCurrentVNode,
          nextDocument.body,
          oldContainer!,
          new Set(),
        ),
      )
    }

    const oldRootHtml = (): string => {
      const rootVNode = Option.getOrThrow(maybeCurrentVNode)
      return rootVNode.elm !== undefined ? serializeDomNode(rootVNode.elm) : ''
    }

    patchOld(oldModel)

    store = makeModelStore(newModel)
    const binding: Binding<Model, Message> = viewBoundFactory()
    mounted = mount({
      binding,
      view: store.view,
      dispatch: () => {},
      container: newContainer,
      document,
    })

    const assertEquivalent = (model: Model): void => {
      const oldHtml = oldRootHtml()
      const newHtml = serializeContainer(newContainer!)
      expect(newHtml).toBe(oldHtml)
      const materializedHtml = serializeMaterialized(
        materialize(binding, model),
      )
      expect(materializedHtml).toBe(oldHtml)
    }

    assertEquivalent(oldModel)

    for (const message of script) {
      oldModel = update(oldModel, message)[0]
      patchOld(oldModel)

      newModel = update(newModel, message)[0]
      store.reconcile(newModel)
      flush()

      assertEquivalent(newModel)
    }
  })
})
