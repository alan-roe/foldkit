import { Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { installDomCounter } from '../../test/apps/renderCompare/domCounter.js'
import { flush } from '../reactive/scheduler.js'
import type { ModelStore } from '../reactive/store.js'
import { makeModelStore } from '../reactive/store.js'
import type { Binding, FrameCell, Host, Sub } from './binding.js'
import {
  attr,
  cond,
  el,
  list,
  on,
  onMount,
  onUnmount,
  text,
} from './binding.js'
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

// FIXTURES: Sub/Host - no public constructors (submodel() is SeamData's,
// not exercised here), so tests build raw Sub/Host nodes directly, the same
// way `list`/`cond` are exercised by construction rather than by some
// higher-level authoring API. Mirrors the List-precedent erasure the real
// `submodel()` performs at the union boundary.

type ChildModel = Readonly<{ count: number }>
type ChildMessage = Readonly<{ _tag: 'Incremented' }>
const incremented = (): ChildMessage => ({ _tag: 'Incremented' })

const makeSub = <ParentModel, ParentMessage, Child, ChildMsg>(
  select: (model: ParentModel) => Child,
  toMessage: (childMessage: ChildMsg) => ParentMessage,
  binding: Binding<Child, ChildMsg>,
  frame: FrameCell = { current: undefined },
): Sub<ParentModel, ParentMessage> => ({
  _tag: 'Sub',
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only Sub construction bypassing submodel() (no public sub() constructor); mirrors the List-precedent erasure at the Binding union boundary (binding.ts:79-80).
  select: select as (model: ParentModel) => unknown,
  toMessage: toMessage as (childMessage: unknown) => ParentMessage,
  binding: binding as Binding<unknown, unknown>,
  frame,
})

const makeHost = <Model, Message>(
  binding: Binding<Model, Message>,
  frame: FrameCell,
): Host<Model, Message> => ({
  _tag: 'Host',
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only Host construction bypassing submodel() (no public host constructor); mirrors the List-precedent erasure at the Binding union boundary (binding.ts:79-80).
  binding: binding as Binding<unknown, unknown>,
  frame,
})

// SECTION 6(a): Sub under a List row

type SubRow = Readonly<{ id: string; child: ChildModel }>
type RowsModel = Readonly<{ rows: ReadonlyArray<SubRow> }>
type RowsMessage = Readonly<{
  _tag: 'RowChild'
  id: string
  message: ChildMessage
}>
const rowChild = (id: string, message: ChildMessage): RowsMessage => ({
  _tag: 'RowChild',
  id,
  message,
})

const makeSubRows = (count: number): ReadonlyArray<SubRow> =>
  Array.from({ length: count }, (_unused, index) => ({
    id: `row-${index}`,
    child: { count: 0 },
  }))

const listWithSubView = el<RowsModel, RowsMessage>(
  'ul',
  [],
  [
    list<RowsModel, RowsMessage, SubRow>(
      model => model.rows,
      row => row.id,
      readRow =>
        el(
          'li',
          [attr('data-row-id', () => readRow().id)],
          [
            makeSub<RowsModel, RowsMessage, ChildModel, ChildMessage>(
              () => readRow().child,
              message => rowChild(readRow().id, message),
              el(
                'span',
                [on('click', () => incremented())],
                [text(() => String(readRow().child.count))],
              ),
            ),
          ],
        ),
    ),
  ],
)

describe('Sub under a List row (design doc section 6, [INFERENCE] verification)', () => {
  it('tracks at the row item signal: a child-field change writes only that row DOM, O(1)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let model: RowsModel = { rows: makeSubRows(5) }
    const store = makeModelStore(model)
    const dispatched: Array<RowsMessage> = []
    const counter = installDomCounter(window)

    const mounted = mount({
      binding: listWithSubView,
      view: store.view,
      dispatch: (message: RowsMessage): void => {
        dispatched.push(message)
      },
      container,
      document,
    })

    const spansBefore = Array.from(container.querySelectorAll('span'))
    expect(spansBefore.map(span => span.textContent)).toEqual([
      '0',
      '0',
      '0',
      '0',
      '0',
    ])

    counter.reset()

    const targetId = 'row-2'
    model = {
      rows: model.rows.map(row =>
        row.id === targetId
          ? { ...row, child: { count: row.child.count + 1 } }
          : row,
      ),
    }
    store.reconcile(model)
    flush()

    // The row's own `attr('data-row-id', ...)` re-evaluates too (same
    // itemSignal, gated by Equal.equals to a no-op write), so only the
    // child count's text write shows up - one row's DOM touched, nothing
    // else: O(1) regardless of row count.
    expect(counter.read()).toStrictEqual({
      attributeWrites: 0,
      textWrites: 1,
      insertions: 0,
      removals: 0,
      moves: 0,
      total: 1,
    })

    const spansAfter = Array.from(container.querySelectorAll('span'))
    expect(spansAfter.map(span => span.textContent)).toEqual([
      '0',
      '0',
      '1',
      '0',
      '0',
    ])
    // Every row's <span> kept its identity - no row was rebuilt.
    spansBefore.forEach((span, index) => {
      expect(spansAfter[index]).toBe(span)
    })

    spansBefore[2]?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(dispatched).toEqual([rowChild('row-2', incremented())])

    counter.uninstall()
    mounted.dispose()
    store.dispose()
    container.remove()
  })
})

// SECTION 6(b): Option-leaf grain under Cond

type OptionalModel = Readonly<{ maybeChild: Option.Option<ChildModel> }>
type OptionalMessage = Readonly<{ _tag: 'ChildMsg'; message: ChildMessage }>
const childMsg = (message: ChildMessage): OptionalMessage => ({
  _tag: 'ChildMsg',
  message,
})

const optionalView = cond<OptionalModel, OptionalMessage>(
  optionModel => (Option.isSome(optionModel.maybeChild) ? 'some' : 'none'),
  key =>
    key === 'some'
      ? makeSub<OptionalModel, OptionalMessage, ChildModel, ChildMessage>(
          optionModel => Option.getOrThrow(optionModel.maybeChild),
          childMsg,
          text(childModel => String(childModel.count)),
        )
      : text('none'),
)

describe('Option-leaf grain under Cond (design doc section 6, [INFERENCE] closed)', () => {
  it('re-fires the Cond discriminant thunk at leaf grain on a payload-only change, DOM writes stay gated at zero', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let model: OptionalModel = { maybeChild: Option.some({ count: 0 }) }
    const store = makeModelStore(model)
    const counter = installDomCounter(window)
    let thunkEvaluations = 0

    const mounted = mount({
      binding: optionalView,
      view: store.view,
      dispatch: (): void => {},
      container,
      document,
      onThunkEvaluation: () => {
        thunkEvaluations += 1
      },
    })

    expect(container.textContent).toBe('0')

    counter.reset()
    thunkEvaluations = 0

    // Payload-only change: still `Some`, count 0 -> 1. Option is one leaf
    // signal (store.ts: "arrays/Options/Data instances are single leaf
    // signals") - this write targets the WHOLE Option value, not a field
    // path inside it.
    model = { maybeChild: Option.some({ count: 1 }) }
    store.reconcile(model)
    flush()

    // The Cond's own discriminant thunk is the sole reader of `maybeChild`;
    // it re-evaluates because the leaf signal it subscribed to changed
    // (`ctx.onThunkEvaluation` fires on every effect execution, not only on
    // a branch rebuild) - exactly the "re-fires at leaf grain" claim.
    expect(thunkEvaluations).toBe(1)

    // The branch key ('some') didn't change, so `setupCond`'s early return
    // skips dispose/rebuild entirely: zero DOM writes despite the
    // re-evaluation above - "DOM writes stay gated".
    expect(counter.read()).toStrictEqual({
      attributeWrites: 0,
      textWrites: 0,
      insertions: 0,
      removals: 0,
      moves: 0,
      total: 0,
    })

    // Closes the [INFERENCE]: the Sub inside the Some branch was built
    // ONCE against the payload `select` captured at that mount (a plain
    // snapshot, not a live-tracking proxy - Option payloads aren't
    // record-proxied), so its own text thunk never re-subscribes to
    // anything and the DOM is exactly as stale as leaf-grain predicts.
    // Acceptable at Submodel scale (a whole-Option flip already rebuilds
    // the subtree; per-field reactivity below that boundary isn't the
    // seam's job) precisely because nothing was wasted: zero DOM writes,
    // not a silently wrong write.
    expect(container.textContent).toBe('0')

    counter.uninstall()
    mounted.dispose()
    store.dispose()
    container.remove()
  })
})

// LIFECYCLE

type FrameHostModel = Readonly<{ child: ChildModel }>
type FrameHostMessage = Readonly<{ _tag: 'ChildMsg2'; message: ChildMessage }>
const childMsg2 = (message: ChildMessage): FrameHostMessage => ({
  _tag: 'ChildMsg2',
  message,
})

describe('Sub/Host lifecycle', () => {
  it('fills the shared FrameCell at mount and clears it on disposal', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const frame: FrameCell = { current: undefined }
    const subBinding = makeSub<
      FrameHostModel,
      FrameHostMessage,
      ChildModel,
      ChildMessage
    >(
      childModel => childModel.child,
      childMsg2,
      text(childModel => String(childModel.count)),
      frame,
    )
    const store = makeModelStore<FrameHostModel>({ child: { count: 0 } })
    const dispatched: Array<FrameHostMessage> = []

    const mounted = mount({
      binding: subBinding,
      view: store.view,
      dispatch: (message: FrameHostMessage): void => {
        dispatched.push(message)
      },
      container,
      document,
    })

    expect(frame.current).not.toBeUndefined()
    frame.current?.dispatch(childMsg2(incremented()))
    expect(dispatched).toEqual([childMsg2(incremented())])

    mounted.dispose()
    expect(frame.current).toBeUndefined()

    store.dispose()
    container.remove()
  })

  it('composes toMessage outward through two nested Subs', () => {
    type Level2Model = Readonly<{ count: number }>
    type Level2Message = Readonly<{ _tag: 'Bumped' }>
    const bumped = (): Level2Message => ({ _tag: 'Bumped' })

    type Level1Model = Readonly<{ level2: Level2Model }>
    type Level1Message = Readonly<{ _tag: 'Level2'; message: Level2Message }>
    const level2Msg = (message: Level2Message): Level1Message => ({
      _tag: 'Level2',
      message,
    })

    type Level0Model = Readonly<{ level1: Level1Model }>
    type Level0Message = Readonly<{ _tag: 'Level1'; message: Level1Message }>
    const level1Msg = (message: Level1Message): Level0Message => ({
      _tag: 'Level1',
      message,
    })

    const level2View: Binding<Level2Model, Level2Message> = el(
      'button',
      [on('click', () => bumped())],
      [text(childModel => String(childModel.count))],
    )
    const level1View: Binding<Level1Model, Level1Message> = el(
      'div',
      [],
      [
        makeSub<Level1Model, Level1Message, Level2Model, Level2Message>(
          childModel => childModel.level2,
          level2Msg,
          level2View,
        ),
      ],
    )
    const level0View: Binding<Level0Model, Level0Message> = el(
      'section',
      [],
      [
        makeSub<Level0Model, Level0Message, Level1Model, Level1Message>(
          childModel => childModel.level1,
          level1Msg,
          level1View,
        ),
      ],
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    const store = makeModelStore<Level0Model>({
      level1: { level2: { count: 0 } },
    })
    const dispatched: Array<Level0Message> = []

    const mounted = mount({
      binding: level0View,
      view: store.view,
      dispatch: (message: Level0Message): void => {
        dispatched.push(message)
      },
      container,
      document,
    })

    container
      .querySelector('button')
      ?.dispatchEvent(new Event('click', { bubbles: true }))

    expect(dispatched).toEqual([level1Msg(level2Msg(bumped()))])

    mounted.dispose()
    store.dispose()
    container.remove()
  })

  it('Host island thunks read the parent model and dispatch unwrapped parent-typed messages', () => {
    const frame: FrameCell = { current: undefined }
    type HostParentModel = Readonly<{ title: string; child: ChildModel }>
    type HostParentMessage =
      | Readonly<{ _tag: 'ChildMsg'; message: ChildMessage }>
      | Readonly<{ _tag: 'ClickedTitle' }>
    const childMsg3 = (message: ChildMessage): HostParentMessage => ({
      _tag: 'ChildMsg',
      message,
    })
    const clickedTitle = (): HostParentMessage => ({ _tag: 'ClickedTitle' })

    const hostLayout: Binding<HostParentModel, HostParentMessage> = el(
      'h1',
      [on('click', () => clickedTitle())],
      [text(hostModel => hostModel.title)],
    )
    const childWithHostView: Binding<ChildModel, ChildMessage> = el(
      'div',
      [],
      [
        el(
          'button',
          [on('click', () => incremented())],
          [text(childModel => String(childModel.count))],
        ),
        makeHost<HostParentModel, HostParentMessage>(hostLayout, frame),
      ],
    )
    const rootView: Binding<HostParentModel, HostParentMessage> = el(
      'main',
      [],
      [
        makeSub<HostParentModel, HostParentMessage, ChildModel, ChildMessage>(
          hostModel => hostModel.child,
          childMsg3,
          childWithHostView,
          frame,
        ),
      ],
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    const store = makeModelStore<HostParentModel>({
      title: 'Hello',
      child: { count: 0 },
    })
    const dispatched: Array<HostParentMessage> = []

    const mounted = mount({
      binding: rootView,
      view: store.view,
      dispatch: (message: HostParentMessage): void => {
        dispatched.push(message)
      },
      container,
      document,
    })

    expect(container.querySelector('h1')?.textContent).toBe('Hello')

    container
      .querySelector('h1')
      ?.dispatchEvent(new Event('click', { bubbles: true }))
    // Unwrapped: the Host island's dispatch is the frame's raw parent
    // dispatch, never composed through the Sub's `toMessage`.
    expect(dispatched).toEqual([clickedTitle()])

    container
      .querySelector('button')
      ?.dispatchEvent(new Event('click', { bubbles: true }))
    // Composed: content inside the Sub's own binding (not the Host) is
    // wrapped through `toMessage` as usual.
    expect(dispatched).toEqual([clickedTitle(), childMsg3(incremented())])

    mounted.dispose()
    store.dispose()
    container.remove()
  })

  it('runs owner cleanups (an UnmountAttr dispatch) before the DOM range is detached', () => {
    type UnmountRow = Readonly<{ id: string }>
    type UnmountModel = Readonly<{ rows: ReadonlyArray<UnmountRow> }>
    type UnmountMessage = Readonly<{ _tag: 'RowUnmounted'; id: string }>
    const rowUnmounted = (id: string): UnmountMessage => ({
      _tag: 'RowUnmounted',
      id,
    })

    const unmountListView = el<UnmountModel, UnmountMessage>(
      'ul',
      [],
      [
        list<UnmountModel, UnmountMessage, UnmountRow>(
          model => model.rows,
          row => row.id,
          readRow =>
            el(
              'li',
              [onUnmount(rowUnmounted(readRow().id))],
              [text(() => readRow().id)],
            ),
        ),
      ],
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    let model: UnmountModel = { rows: [{ id: 'a' }, { id: 'b' }] }
    const store = makeModelStore(model)
    const dispatched: Array<UnmountMessage> = []
    let wasConnectedAtDispatch: boolean | undefined
    let targetLiRef: Element | undefined

    const mounted = mount({
      binding: unmountListView,
      view: store.view,
      dispatch: (message: UnmountMessage): void => {
        dispatched.push(message)
        if (message._tag === 'RowUnmounted' && message.id === 'a') {
          wasConnectedAtDispatch = targetLiRef?.isConnected
        }
      },
      container,
      document,
    })

    targetLiRef = Array.from(container.querySelectorAll('li')).find(
      li => li.textContent === 'a',
    )
    const targetLi = targetLiRef
    expect(targetLi).not.toBeUndefined()
    if (targetLi === undefined) {
      throw new Error('targetLi not found')
    }

    model = { rows: [{ id: 'b' }] }
    store.reconcile(model)
    flush()

    expect(dispatched).toEqual([rowUnmounted('a')])
    expect(wasConnectedAtDispatch).toBe(true)
    expect(targetLi.isConnected).toBe(false)

    mounted.dispose()
    store.dispose()
    container.remove()
  })
})

// MOUNT / UNMOUNT ATTRIBUTES

type MountModel = Readonly<{ started: boolean }>
type MountMessage = Readonly<{ _tag: 'MountRan' }>
const mountRan = (): MountMessage => ({ _tag: 'MountRan' })

describe('Mount/Unmount attributes', () => {
  it('is inert when no runMountAction is supplied', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const store = makeModelStore<MountModel>({ started: false })
    const dispatched: Array<MountMessage> = []

    const view = el<MountModel, MountMessage>(
      'div',
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only MountAction stub; only `name`/`f` matter to the renderer, `f` is never invoked in this test since no runMountAction is supplied.
      [
        onMount({
          name: 'Noop',
          f: () => {
            throw new Error('never invoked')
          },
        } as never),
      ],
      [],
    )

    const mounted = mount({
      binding: view,
      view: store.view,
      dispatch: (message: MountMessage): void => {
        dispatched.push(message)
      },
      container,
      document,
    })

    expect(dispatched).toEqual([])

    mounted.dispose()
    store.dispose()
    container.remove()
  })

  it('invokes runMountAction after element creation and its interrupt on disposal', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const store = makeModelStore<MountModel>({ started: false })
    const dispatched: Array<MountMessage> = []
    const interrupts: Array<string> = []
    const seenActions: Array<Readonly<{ name: string; element: Element }>> = []

    const action = {
      name: 'Started',
      f: () => {
        throw new Error('unused: runMountAction is stubbed in this test')
      },
    }

    const view = el<MountModel, MountMessage>(
      'div',
      [attr('data-testid', 'mount-target'), onMount(action as never)],
      [],
    )

    const mounted = mount({
      binding: view,
      view: store.view,
      dispatch: (message: MountMessage): void => {
        dispatched.push(message)
      },
      container,
      document,
      runMountAction: (mountAction, element, mountDispatch) => {
        seenActions.push({ name: mountAction.name, element })
        mountDispatch(mountRan())
        return () => {
          interrupts.push(mountAction.name)
        }
      },
    })

    expect(seenActions).toEqual([
      {
        name: 'Started',
        element: container.querySelector('[data-testid="mount-target"]'),
      },
    ])
    expect(dispatched).toEqual([mountRan()])
    expect(interrupts).toEqual([])

    mounted.dispose()
    expect(interrupts).toEqual(['Started'])

    store.dispose()
    container.remove()
  })
})
