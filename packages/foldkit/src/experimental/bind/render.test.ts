import { afterEach, describe, expect, it } from 'vitest'

import { flush } from '../reactive/scheduler.js'
import type { ModelStore } from '../reactive/store.js'
import { makeModelStore } from '../reactive/store.js'
import { attr, cond, el, list, on, text } from './binding.js'
import type { Mounted } from './render.js'
import { mount } from './render.js'

// FIXTURES

type Row = Readonly<{ id: string; label: string }>

type Model = Readonly<{ rows: ReadonlyArray<Row> }>

type Message = Readonly<{ _tag: 'Clicked'; id: string }>

const clicked = (id: string): Message => ({ _tag: 'Clicked', id })

const makeRows = (count: number): ReadonlyArray<Row> =>
  Array.from({ length: count }, (_unused, index) => ({
    id: `row-${index}`,
    label: `Row ${index}`,
  }))

/** A `<ul>` with a keyed `List` of `<li>` rows, each carrying an `on`
 *  listener - close enough to the shared TodoMVC fixtures to exercise
 *  listener cleanup on row disposal without depending on
 *  `src/test/apps/renderCompare`. */
const listView = el<Model, Message>(
  'ul',
  [],
  [
    list<Model, Message, Row>(
      model => model.rows,
      row => row.id,
      readRow =>
        el(
          'li',
          [on('click', () => clicked(readRow().id))],
          [text(() => readRow().label)],
        ),
    ),
  ],
)

/** Every row also renders a `Cond` keyed by parity - exercises a `List`
 *  row whose own subtree owns a further reactive region, so clearing the
 *  outer `List` must dispose that inner `Cond`'s owner too. */
const listWithNestedCondView = el<Model, Message>(
  'ul',
  [],
  [
    list<Model, Message, Row>(
      model => model.rows,
      row => row.id,
      readRow =>
        el(
          'li',
          [],
          [
            cond<Model, Message>(
              () =>
                Number(readRow().id.split('-')[1]) % 2 === 0 ? 'even' : 'odd',
              key => text(key === 'even' ? 'even row' : 'odd row'),
            ),
          ],
        ),
    ),
  ],
)

type Harness = Readonly<{
  store: ModelStore<Model>
  mounted: Mounted
  container: HTMLElement
  dispatched: Array<Message>
}>

const setupHarness = (
  binding: typeof listView,
  initial: Model,
  container: HTMLElement,
): Harness => {
  const store = makeModelStore(initial)
  const dispatched: Array<Message> = []
  const mounted = mount({
    binding,
    view: store.view,
    dispatch: (message: Message): void => {
      dispatched.push(message)
    },
    container,
    document,
  })
  return { store, mounted, container, dispatched }
}

let harness: Harness | undefined

afterEach(() => {
  if (harness === undefined) {
    return
  }
  harness.mounted.dispose()
  harness.store.dispose()
  harness.container.remove()
  harness = undefined
})

// TESTS

describe('setupList clear fast path', () => {
  it('clears every row when the List is the sole content of its parent, leaving only its anchors', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    harness = setupHarness(listView, { rows: makeRows(50) }, container)

    const ul = container.querySelector('ul')
    expect(ul).not.toBeNull()
    expect(ul?.querySelectorAll('li').length).toBe(50)

    harness.store.reconcile({ rows: [] })
    flush()

    expect(ul?.querySelectorAll('li').length).toBe(0)
    // Only the two List anchors (both Comment nodes) remain under <ul>.
    expect(ul?.childNodes.length).toBe(2)
    expect(ul?.childNodes[0]?.nodeType).toBe(Node.COMMENT_NODE)
    expect(ul?.childNodes[1]?.nodeType).toBe(Node.COMMENT_NODE)
  })

  it('clears rows while non-list siblings before and after survive untouched', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const withSiblingsView = el<Model, Message>(
      'section',
      [],
      [
        el('header', [attr('data-role', 'before')], [text('before')]),
        listView,
        el('footer', [attr('data-role', 'after')], [text('after')]),
      ],
    )

    harness = setupHarness(withSiblingsView, { rows: makeRows(30) }, container)

    const section = container.querySelector('section')
    expect(section?.querySelectorAll('li').length).toBe(30)

    harness.store.reconcile({ rows: [] })
    flush()

    expect(section?.querySelectorAll('li').length).toBe(0)
    expect(section?.querySelector('header')?.getAttribute('data-role')).toBe(
      'before',
    )
    expect(section?.querySelector('header')?.textContent).toBe('before')
    expect(section?.querySelector('footer')?.getAttribute('data-role')).toBe(
      'after',
    )
    expect(section?.querySelector('footer')?.textContent).toBe('after')

    // header, ul (holding its two now-adjacent anchors), footer.
    expect(section?.children.length).toBe(3)
  })

  it('re-populates after a clear: anchors intact, fresh rows keyed/ordered correctly and live', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    harness = setupHarness(listView, { rows: makeRows(10) }, container)

    harness.store.reconcile({ rows: [] })
    flush()

    const freshRows = makeRows(5).map(row => ({
      ...row,
      label: `Fresh ${row.label}`,
    }))
    harness.store.reconcile({ rows: freshRows })
    flush()

    const ul = container.querySelector('ul')
    const lis = Array.from(ul?.querySelectorAll('li') ?? [])
    expect(lis.length).toBe(5)
    expect(lis.map(li => li.textContent)).toEqual(
      freshRows.map(row => row.label),
    )

    // A click on a repopulated row's listener still dispatches - proof the
    // fresh row is a live, wired-up owner and not leftover/disposed state.
    lis[0]?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(harness.dispatched).toEqual([clicked(freshRows[0]?.id ?? '')])
  })

  it('disposes a nested Cond inside a cleared row without error', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    harness = setupHarness(
      listWithNestedCondView,
      { rows: makeRows(20) },
      container,
    )

    const ul = container.querySelector('ul')
    expect(ul?.querySelectorAll('li').length).toBe(20)

    expect(() => {
      harness?.store.reconcile({ rows: [] })
      flush()
    }).not.toThrow()

    expect(ul?.querySelectorAll('li').length).toBe(0)
  })

  it('dispose() of the whole mount after a clear removes exactly the mounted nodes', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    harness = setupHarness(listView, { rows: makeRows(15) }, container)

    harness.store.reconcile({ rows: [] })
    flush()

    const ul = container.querySelector('ul')
    expect(ul?.childNodes.length).toBe(2)

    expect(() => {
      harness?.mounted.dispose()
    }).not.toThrow()

    // dispose() tears down owners/listeners only, never removing DOM the
    // renderer built directly (documented mount() contract) - the two
    // List anchors are exactly what a clear + dispose leaves behind.
    expect(ul?.childNodes.length).toBe(2)

    harness.store.dispose()
    harness.container.remove()
    harness = undefined
  })
})
