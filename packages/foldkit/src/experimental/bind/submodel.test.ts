import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type AttrBinding,
  type Binding,
  type Bound,
  attr,
  el,
  on,
  onMount,
  onUnmount,
  text,
} from './binding.js'
import {
  type MaterializedElement,
  type MaterializedNode,
  materialize,
} from './materialize.js'
import { submodel } from './submodel.js'

// FIXTURES: a single Sub + Host, exercising all five lift-table rows

type ChildModel = Readonly<{ count: number; isOn: boolean }>
type ChildMessage =
  | Readonly<{ _tag: 'Incremented' }>
  | Readonly<{ _tag: 'Announced' }>

type ParentModel = Readonly<{ toggle: ChildModel; label: string }>
type ParentMessage =
  | Readonly<{ _tag: 'GotToggle'; message: ChildMessage }>
  | Readonly<{ _tag: 'Cleared' }>

const toGotToggle = (message: ChildMessage): ParentMessage => ({
  _tag: 'GotToggle',
  message,
})

const selectToggle: Bound<ParentModel, ChildModel> = model => model.toggle

type PublishedShape = Readonly<{
  counter: ReadonlyArray<AttrBinding<ChildModel, ChildMessage>>
  lifecycle: ReadonlyArray<AttrBinding<ChildModel, ChildMessage>>
  isOn: Bound<ChildModel, boolean>
}>

const announceAction = {
  name: 'Announce',
  args: { priority: 'high' },
  f: (_element: Element) => Stream.succeed<ChildMessage>({ _tag: 'Announced' }),
}

const makeChildView =
  (callCounter?: { count: number }) =>
  (
    viewInputs: Readonly<{
      toView: (published: PublishedShape) => Binding<ChildModel, ChildMessage>
    }>,
  ): Binding<ChildModel, ChildMessage> => {
    if (callCounter !== undefined) {
      callCounter.count += 1
    }
    const counter: ReadonlyArray<AttrBinding<ChildModel, ChildMessage>> = [
      on('click', () => ({ _tag: 'Incremented' })),
      attr('data-count', model => String(model.count)),
      attr('data-kind', 'counter'),
    ]
    const lifecycle: ReadonlyArray<AttrBinding<ChildModel, ChildMessage>> = [
      onMount(announceAction),
      onUnmount<ChildModel, ChildMessage>({ _tag: 'Incremented' }),
    ]
    const isOn: Bound<ChildModel, boolean> = model => model.isOn

    return el<ChildModel, ChildMessage>(
      'section',
      [attr('data-role', 'child-shell')],
      [viewInputs.toView({ counter, lifecycle, isOn })],
    )
  }

const consumerToView = (
  published: Readonly<{
    counter: ReadonlyArray<AttrBinding<ParentModel, ParentMessage>>
    lifecycle: ReadonlyArray<AttrBinding<ParentModel, ParentMessage>>
    isOn: Bound<ParentModel, boolean>
  }>,
): Binding<ParentModel, ParentMessage> =>
  el<ParentModel, ParentMessage>(
    'div',
    [...published.counter, ...published.lifecycle],
    [
      text(model => model.label),
      text(model => (published.isOn(model) ? 'on' : 'off')),
    ],
  )

const makeParentModel = (
  overrides: Partial<ParentModel> = {},
): ParentModel => ({
  toggle: { count: 0, isOn: false },
  label: 'toggle',
  ...overrides,
})

const buildSectionBinding = (callCounter?: {
  count: number
}): Binding<ParentModel, ParentMessage> =>
  submodel<
    ParentModel,
    ParentMessage,
    ChildModel,
    ChildMessage,
    PublishedShape
  >({
    select: selectToggle,
    toMessage: toGotToggle,
    view: makeChildView(callCounter),
    viewInputs: { toView: consumerToView },
  })

const expectElement = (node: MaterializedNode): MaterializedElement => {
  if (node._tag !== 'MaterializedElement') {
    throw new Error('expected a MaterializedElement')
  }
  return node
}

const materializeHostDiv = (
  model: ParentModel,
  callCounter?: { count: number },
): MaterializedElement => {
  const section = expectElement(
    materialize(buildSectionBinding(callCounter), model),
  )
  return expectElement(
    section.children[0] ?? { _tag: 'MaterializedText', text: '' },
  )
}

// LIFT TABLE

describe('submodel: lift table', () => {
  it('row 1 - On: composes toMessage through the published toMessage chain', () => {
    const div = materializeHostDiv(makeParentModel())

    expect(div.handlers['click']?.(new Event('click'))).toStrictEqual(
      toGotToggle({ _tag: 'Incremented' }),
    )
  })

  it('row 2 - bound Attr: contramaps value through select', () => {
    const div = materializeHostDiv(
      makeParentModel({ toggle: { count: 7, isOn: false } }),
    )

    expect(div.attrs['data-count']).toBe('7')
  })

  it('row 3 - static Attr: passes through unchanged', () => {
    const div = materializeHostDiv(makeParentModel())

    expect(div.attrs['data-kind']).toBe('counter')
  })

  it('row 4 - bare published Bound: contramaps through select like a bound Attr', () => {
    const onDiv = materializeHostDiv(
      makeParentModel({ toggle: { count: 0, isOn: true } }),
    )
    const offDiv = materializeHostDiv(
      makeParentModel({ toggle: { count: 0, isOn: false } }),
    )

    expect(onDiv.children[1]).toStrictEqual({
      _tag: 'MaterializedText',
      text: 'on',
    })
    expect(offDiv.children[1]).toStrictEqual({
      _tag: 'MaterializedText',
      text: 'off',
    })
  })

  it('row 5 - Mount/Unmount: composes the message channel through toMessage', async () => {
    const section = buildSectionBinding()
    if (section._tag !== 'Sub') {
      throw new Error('expected a Sub')
    }
    if (section.binding._tag !== 'El') {
      throw new Error('expected the child shell El')
    }
    const host = section.binding.children[0]
    if (host === undefined || host._tag !== 'Host') {
      throw new Error('expected a Host island')
    }
    if (host.binding._tag !== 'El') {
      throw new Error('expected the consumer div El')
    }
    const mountAttr = host.binding.attrs.find(
      attrBinding => attrBinding._tag === 'Mount',
    )
    const unmountAttr = host.binding.attrs.find(
      attrBinding => attrBinding._tag === 'Unmount',
    )
    if (mountAttr === undefined || mountAttr._tag !== 'Mount') {
      throw new Error('expected a lifted Mount attr')
    }
    if (unmountAttr === undefined || unmountAttr._tag !== 'Unmount') {
      throw new Error('expected a lifted Unmount attr')
    }

    expect(unmountAttr.message).toStrictEqual(
      toGotToggle({ _tag: 'Incremented' }),
    )
    expect(mountAttr.action.name).toBe('Announce')
    expect(mountAttr.action.args).toStrictEqual({ priority: 'high' })
    const stream: Stream.Stream<unknown, unknown> = mountAttr.action.f(
      document.createElement('div'),
    )
    const emitted = await Effect.runPromise(Stream.runCollect(stream))
    expect(emitted).toStrictEqual([toGotToggle({ _tag: 'Announced' })])
  })
})

// HOST ISLAND

describe('submodel: Host island', () => {
  it('sees the full parent model through plain parent-frame thunks, not just lifted child data', () => {
    const div = materializeHostDiv(makeParentModel({ label: 'My Toggle' }))

    expect(div.children[0]).toStrictEqual({
      _tag: 'MaterializedText',
      text: 'My Toggle',
    })
  })
})

// MOUNTS/UNMOUNTS DATA

describe('submodel + materialize: mounts/unmounts data', () => {
  it('surfaces the lifted Mount/Unmount as inert data on the materialized Host element', () => {
    const div = materializeHostDiv(makeParentModel())

    expect(div.mounts).toStrictEqual([
      { name: 'Announce', args: { priority: 'high' } },
    ])
    expect(div.unmounts).toStrictEqual([
      { message: toGotToggle({ _tag: 'Incremented' }) },
    ])
  })
})

// SINGLE-INVOCATION GUARANTEE

describe('submodel: single invocation', () => {
  it('invokes the child view exactly once, regardless of how many times the Sub is materialized', () => {
    const callCounter = { count: 0 }
    const binding = buildSectionBinding(callCounter)

    materialize(binding, makeParentModel())
    materialize(binding, makeParentModel({ toggle: { count: 5, isOn: true } }))
    materialize(binding, makeParentModel())

    expect(callCounter.count).toBe(1)
  })
})

// UNFILLED CELL GUARD

describe('submodel: unfilled frame cell', () => {
  it('throws a clear message when a lifted viewInputs Bound is read before the Sub boundary mounts', () => {
    expect(() =>
      submodel<
        ParentModel,
        ParentMessage,
        ChildModel,
        ChildMessage,
        PublishedShape,
        Readonly<{ label: string }>
      >({
        select: selectToggle,
        toMessage: toGotToggle,
        view: viewInputs => {
          // Read immediately (construction time), before any Sub has ever
          // mounted - the frame cell is guaranteed unfilled here.
          if (typeof viewInputs.label === 'function') {
            viewInputs.label({ count: 0, isOn: false })
          }
          return el<ChildModel, ChildMessage>('section', [], [])
        },
        viewInputs: {
          toView: consumerToView,
          label: model => model.label,
        },
      }),
    ).toThrow(/frame cell is unfilled/)
  })
})

// NESTED SUB COMPOSITION

type Level2Model = Readonly<{ value: number }>
type Level2Message = Readonly<{ _tag: 'Bumped' }>

type Level1Model = Readonly<{ child: Level2Model }>
type Level1Message = Readonly<{ _tag: 'GotChild'; message: Level2Message }>

type Level0Model = Readonly<{ middle: Level1Model }>
type Level0Message = Readonly<{ _tag: 'GotMiddle'; message: Level1Message }>

const toGotChild = (message: Level2Message): Level1Message => ({
  _tag: 'GotChild',
  message,
})

const toGotMiddle = (message: Level1Message): Level0Message => ({
  _tag: 'GotMiddle',
  message,
})

describe('submodel: nested Sub composition', () => {
  it('composes toMessage outward across two Sub boundaries', () => {
    const nestedBinding = submodel<
      Level0Model,
      Level0Message,
      Level1Model,
      Level1Message,
      Readonly<Record<string, never>>
    >({
      select: model => model.middle,
      toMessage: toGotMiddle,
      view: () =>
        submodel<
          Level1Model,
          Level1Message,
          Level2Model,
          Level2Message,
          Readonly<Record<string, never>>
        >({
          select: model => model.child,
          toMessage: toGotChild,
          view: () =>
            el<Level2Model, Level2Message>(
              'span',
              [on('click', () => ({ _tag: 'Bumped' }))],
              [],
            ),
          viewInputs: {
            toView: () => el<Level1Model, Level1Message>('div', [], []),
          },
        }),
      viewInputs: {
        toView: () => el<Level0Model, Level0Message>('div', [], []),
      },
    })

    const model: Level0Model = { middle: { child: { value: 0 } } }
    const span = expectElement(materialize(nestedBinding, model))

    expect(span.handlers['click']?.(new Event('click'))).toStrictEqual(
      toGotMiddle(toGotChild({ _tag: 'Bumped' })),
    )
  })
})
