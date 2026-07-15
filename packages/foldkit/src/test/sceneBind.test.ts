import { Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import * as Bind from '../experimental/bind/public.js'
import * as Scene from './scene.js'

// FIXTURE: a small TodoMVC-ish bindView program (Binding tree, not Html).

type Todo = Readonly<{ id: string; title: string; isCompleted: boolean }>

type Model = Readonly<{
  todos: ReadonlyArray<Todo>
  filter: 'All' | 'Active'
}>

type Message =
  | Readonly<{ _tag: 'ToggledTodo'; id: string }>
  | Readonly<{ _tag: 'SetFilter'; filter: 'All' | 'Active' }>
  | Readonly<{ _tag: 'Reordered' }>

const toggledTodo = (id: string): Message => ({ _tag: 'ToggledTodo', id })
const setFilter = (filter: 'All' | 'Active'): Message => ({
  _tag: 'SetFilter',
  filter,
})
const reordered: Message = { _tag: 'Reordered' }

const initialModel: Model = {
  todos: [
    { id: '1', title: 'first', isCompleted: false },
    { id: '2', title: 'second', isCompleted: false },
  ],
  filter: 'All',
}

const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<never>] => {
  switch (message._tag) {
    case 'ToggledTodo':
      return [
        {
          ...model,
          todos: model.todos.map(todo =>
            todo.id === message.id
              ? { ...todo, isCompleted: !todo.isCompleted }
              : todo,
          ),
        },
        [],
      ]
    case 'SetFilter':
      return [{ ...model, filter: message.filter }, []]
    case 'Reordered':
      return [{ ...model, todos: [...model.todos].reverse() }, []]
  }
}

const visibleTodos = (model: Model): ReadonlyArray<Todo> =>
  model.filter === 'Active'
    ? model.todos.filter(todo => !todo.isCompleted)
    : model.todos

const view: Bind.Binding<Model, Message> = Bind.div(
  [Bind.Class('todoapp')],
  [
    Bind.matchTag<Model, Message>(model => model.filter, {
      All: () => Bind.text('Showing: All'),
      Active: () => Bind.text('Showing: Active'),
    }),
    Bind.ul(
      [Bind.attr('data-count', model => String(visibleTodos(model).length))],
      [
        Bind.list<Model, Message, Todo>(
          visibleTodos,
          todo => todo.id,
          readItem =>
            Bind.li(
              [
                Bind.attr('data-testid', () => `todo-${readItem().id}`),
                Bind.attr('class', () =>
                  readItem().isCompleted ? 'completed' : '',
                ),
                Bind.on('click', () => toggledTodo(readItem().id)),
              ],
              [Bind.text(() => readItem().title)],
            ),
        ),
      ],
    ),
    Bind.p(
      [Bind.attr('data-testid', 'done-count')],
      [
        Bind.text(
          model =>
            `${model.todos.filter(todo => todo.isCompleted).length} done`,
        ),
      ],
    ),
    Bind.button(
      [Bind.attr('data-testid', 'reorder'), Bind.on('click', () => reordered)],
      [Bind.text('Reorder')],
    ),
    Bind.button(
      [
        Bind.attr('data-testid', 'filter-active'),
        Bind.on('click', () => setFilter('Active')),
      ],
      [Bind.text('Active filter')],
    ),
  ],
)

// TESTS

describe('Scene with a bindView program (makeElement shape)', () => {
  test('a locator finds bound text after a with step', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('todo-1')).toHaveText('first'),
      Scene.expect(Scene.testId('todo-2')).toHaveText('second'),
    )
  })

  test('click dispatches through on(), and the next step sees the updated view', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('done-count')).toHaveText('0 done'),
      Scene.click(Scene.testId('todo-1')),
      Scene.expect(Scene.testId('done-count')).toHaveText('1 done'),
      Scene.expect(Scene.testId('todo-1')).toHaveClass('completed'),
    )
  })

  test('keyed list rows keep their identity across a reorder', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.first(Scene.all.selector('li'))).toHaveText('first'),
      Scene.click(Scene.testId('reorder')),
      // DOM order flipped ...
      Scene.expect(Scene.first(Scene.all.selector('li'))).toHaveText('second'),
      // ... but each row's `key` (from list()'s toKey) still resolves to the
      // same logical row, independent of position.
      Scene.expect(Scene.selector('[key="1"]')).toHaveText('first'),
      Scene.expect(Scene.selector('[key="2"]')).toHaveText('second'),
    )
  })

  test('a cond branch switches when the discriminant changes', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('Showing: All')).toExist(),
      Scene.expect(Scene.text('Showing: Active')).toBeAbsent(),
      Scene.click(Scene.testId('filter-active')),
      Scene.expect(Scene.text('Showing: Active')).toExist(),
      Scene.expect(Scene.text('Showing: All')).toBeAbsent(),
    )
  })

  test('toHaveHandler matches an on() listener', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('todo-1')).toHaveHandler('click'),
    )
  })

  test('toHaveHandler fails for an event with no on() listener', () => {
    expect(() =>
      Scene.scene(
        { update, bindView: view },
        Scene.with(initialModel),
        Scene.expect(Scene.testId('todo-1')).toHaveHandler('dblclick'),
      ),
    ).toThrow(/have handler "dblclick"/)
  })

  test('toHaveHook fails clearly: bindView has no hook lifecycle', () => {
    expect(() =>
      Scene.scene(
        { update, bindView: view },
        Scene.with(initialModel),
        Scene.expect(Scene.testId('todo-1')).toHaveHook('mount'),
      ),
    ).toThrow(/fine-grained \(bindView\) render path/)
  })

  test('the standalone sceneMatchers.toHaveHook gives the same bindView guidance', () => {
    Scene.scene(
      { update, bindView: view },
      Scene.with(initialModel),
      Scene.tap(({ html }) => {
        const element = Scene.testId('todo-1')(html)
        expect(() => expect(element).toHaveHook('mount')).toThrow(
          /fine-grained \(bindView\) render path/,
        )
      }),
    )
  })

  test('requires exactly one of view/bindView: throws when both are given', () => {
    expect(() =>
      Scene.scene(
        {
          update,
          view: () => Bind.div([], []) as never,
          bindView: view,
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        } as never,
        Scene.with(initialModel),
      ),
    ).toThrow(/exactly one of `view` or `bindView`/)
  })

  test('requires exactly one of view/bindView: throws when neither is given', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      Scene.scene({ update } as never, Scene.with(initialModel)),
    ).toThrow(/exactly one of `view` or `bindView`/)
  })
})

describe('Scene with a bindView program (makeApplication shape)', () => {
  test('renders `body` and ignores `title`', () => {
    Scene.scene(
      {
        update,
        bindView: { title: 'My Todos', body: view },
      },
      Scene.with(initialModel),
      Scene.expect(Scene.testId('todo-1')).toHaveText('first'),
      Scene.click(Scene.testId('todo-1')),
      Scene.expect(Scene.testId('done-count')).toHaveText('1 done'),
    )
  })
})

// FIXTURE: Sub/Host - a Counter Submodel embedded via `Bind.submodel`. The
// consumer's Host content (the counter button) is built from the Counter's
// own published `on('click', ...)` group, so clicking it exercises both a
// Sub-originated handler and a locator resolving inside the Host island in
// the same interaction.

type CounterModel = Readonly<{ count: number }>

type CounterMessage = Readonly<{ _tag: 'IncrementedCounter'; step: number }>

type CounterShape = Readonly<{
  button: ReadonlyArray<Bind.AttrBinding<CounterModel, CounterMessage>>
}>

const incrementedCounter = (step: number): CounterMessage => ({
  _tag: 'IncrementedCounter',
  step,
})

const counterUpdate = (
  model: CounterModel,
  message: CounterMessage,
): readonly [CounterModel, ReadonlyArray<never>] => [
  { count: model.count + message.step },
  [],
]

const counterChildView = (
  viewInputs: Readonly<{
    toView: (
      published: CounterShape,
    ) => Bind.Binding<CounterModel, CounterMessage>
  }>,
): Bind.Binding<CounterModel, CounterMessage> =>
  viewInputs.toView({
    button: [
      Bind.attr('data-testid', 'counter-button'),
      Bind.on('click', () => incrementedCounter(5)),
    ],
  })

type SubHostRootModel = Readonly<{
  counter: CounterModel
  lastReceived: string
}>

type SubHostRootMessage = Readonly<{
  _tag: 'GotCounterMessage'
  message: CounterMessage
}>

const gotCounterMessage = (message: CounterMessage): SubHostRootMessage => ({
  _tag: 'GotCounterMessage',
  message,
})

const subHostInitialModel: SubHostRootModel = {
  counter: { count: 0 },
  lastReceived: 'none',
}

const subHostUpdate = (
  model: SubHostRootModel,
  message: SubHostRootMessage,
): readonly [SubHostRootModel, ReadonlyArray<never>] => {
  const [nextCounter] = counterUpdate(model.counter, message.message)
  return [
    {
      counter: nextCounter,
      lastReceived: `step:${message.message.step}`,
    },
    [],
  ]
}

const subHostRootView: Bind.Binding<SubHostRootModel, SubHostRootMessage> =
  Bind.div(
    [],
    [
      Bind.submodel<
        SubHostRootModel,
        SubHostRootMessage,
        CounterModel,
        CounterMessage,
        CounterShape
      >({
        select: (model: SubHostRootModel) => model.counter,
        toMessage: gotCounterMessage,
        view: counterChildView,
        viewInputs: {
          toView: published =>
            Bind.div(
              [Bind.attr('data-testid', 'counter-host')],
              [
                Bind.p([], [Bind.text('Counter host content')]),
                Bind.button(published.button, [Bind.text('Increment')]),
              ],
            ),
        },
      }),
      Bind.p(
        [Bind.attr('data-testid', 'last-received')],
        [Bind.text(model => model.lastReceived)],
      ),
    ],
  )

// FIXTURE: nested two-level Sub - Level1 embeds a Level0 Submodel of its own
// (a grandchild, alongside its own Host content), so a click on Level0's
// button must compose both `toMessage` lifts outward: Level1's static
// `liftAttr` (child -> Level1) composed with materialize's dynamic `wrap`
// (Level1 -> root).

type Level0Model = Readonly<{ count: number }>

type Level0Message = Readonly<{ _tag: 'IncrementedLevel0'; step: number }>

type Level0Shape = Readonly<{
  button: ReadonlyArray<Bind.AttrBinding<Level0Model, Level0Message>>
}>

const incrementedLevel0 = (step: number): Level0Message => ({
  _tag: 'IncrementedLevel0',
  step,
})

const level0Update = (
  model: Level0Model,
  message: Level0Message,
): readonly [Level0Model, ReadonlyArray<never>] => [
  { count: model.count + message.step },
  [],
]

const level0ChildView = (
  viewInputs: Readonly<{
    toView: (published: Level0Shape) => Bind.Binding<Level0Model, Level0Message>
  }>,
): Bind.Binding<Level0Model, Level0Message> =>
  viewInputs.toView({
    button: [
      Bind.attr('data-testid', 'level0-button'),
      Bind.on('click', () => incrementedLevel0(7)),
    ],
  })

type Level1Model = Readonly<{ level0: Level0Model }>

type Level1Message = Readonly<{ _tag: 'GotLevel0'; message: Level0Message }>

type Level1Shape = Readonly<{
  wrapper: ReadonlyArray<Bind.AttrBinding<Level1Model, Level1Message>>
}>

const gotLevel0 = (message: Level0Message): Level1Message => ({
  _tag: 'GotLevel0',
  message,
})

const level1Update = (
  model: Level1Model,
  message: Level1Message,
): readonly [Level1Model, ReadonlyArray<never>] => {
  const [nextLevel0] = level0Update(model.level0, message.message)
  return [{ level0: nextLevel0 }, []]
}

const level1ChildView = (
  viewInputs: Readonly<{
    toView: (published: Level1Shape) => Bind.Binding<Level1Model, Level1Message>
  }>,
): Bind.Binding<Level1Model, Level1Message> =>
  Bind.div(
    [],
    [
      viewInputs.toView({
        wrapper: [Bind.attr('data-testid', 'level1-wrapper')],
      }),
      Bind.submodel<
        Level1Model,
        Level1Message,
        Level0Model,
        Level0Message,
        Level0Shape
      >({
        select: (level1Model: Level1Model) => level1Model.level0,
        toMessage: gotLevel0,
        view: level0ChildView,
        viewInputs: {
          toView: publishedLevel0 =>
            Bind.button(publishedLevel0.button, [
              Bind.text('Level0 button (grandchild)'),
            ]),
        },
      }),
    ],
  )

type NestedRootModel = Readonly<{
  level1: Level1Model
  lastReceived: string
}>

type NestedRootMessage = Readonly<{
  _tag: 'GotLevel1'
  message: Level1Message
}>

const gotLevel1 = (message: Level1Message): NestedRootMessage => ({
  _tag: 'GotLevel1',
  message,
})

const nestedInitialModel: NestedRootModel = {
  level1: { level0: { count: 0 } },
  lastReceived: 'none',
}

const nestedUpdate = (
  model: NestedRootModel,
  message: NestedRootMessage,
): readonly [NestedRootModel, ReadonlyArray<never>] => {
  const [nextLevel1] = level1Update(model.level1, message.message)
  return [{ level1: nextLevel1, lastReceived: JSON.stringify(message) }, []]
}

const nestedRootView: Bind.Binding<NestedRootModel, NestedRootMessage> =
  Bind.div(
    [],
    [
      Bind.submodel<
        NestedRootModel,
        NestedRootMessage,
        Level1Model,
        Level1Message,
        Level1Shape
      >({
        select: (model: NestedRootModel) => model.level1,
        toMessage: gotLevel1,
        view: level1ChildView,
        viewInputs: {
          toView: publishedWrapper =>
            Bind.div(publishedWrapper.wrapper, [
              Bind.text('Level1 host wrapper'),
            ]),
        },
      }),
      Bind.p(
        [Bind.attr('data-testid', 'nested-last-received')],
        [Bind.text(model => model.lastReceived)],
      ),
    ],
  )

// FIXTURE: a Sub-published Mount group, proving `Scene.Mount.*`/`toHaveMount`
// read the bind path's `mounts` field exactly like the `html` path's
// `OnMount` marker.

type MountModel = Readonly<{ isPanelOpen: boolean }>

type MountMessage = Readonly<{ _tag: 'MountFired' }>

const mountedPanel = { name: 'MountedPanel' }

type MountShape = Readonly<{
  panel: ReadonlyArray<Bind.AttrBinding<MountModel, MountMessage>>
}>

const mountUpdate = (
  model: MountModel,
  _message: MountMessage,
): readonly [MountModel, ReadonlyArray<never>] => [model, []]

const mountChildView = (
  viewInputs: Readonly<{
    toView: (published: MountShape) => Bind.Binding<MountModel, MountMessage>
  }>,
): Bind.Binding<MountModel, MountMessage> =>
  viewInputs.toView({
    panel: [
      Bind.attr('data-testid', 'mount-panel'),
      Bind.onMount({ name: 'MountedPanel', f: () => Stream.empty }),
    ],
  })

type MountRootModel = Readonly<{ child: MountModel }>

type MountRootMessage = Readonly<{
  _tag: 'GotMountChild'
  message: MountMessage
}>

const gotMountChild = (message: MountMessage): MountRootMessage => ({
  _tag: 'GotMountChild',
  message,
})

const mountRootUpdate = (
  model: MountRootModel,
  message: MountRootMessage,
): readonly [MountRootModel, ReadonlyArray<never>] => {
  const [nextChild] = mountUpdate(model.child, message.message)
  return [{ child: nextChild }, []]
}

const mountRootView: Bind.Binding<MountRootModel, MountRootMessage> = Bind.div(
  [],
  [
    Bind.submodel<
      MountRootModel,
      MountRootMessage,
      MountModel,
      MountMessage,
      MountShape
    >({
      select: (model: MountRootModel) => model.child,
      toMessage: gotMountChild,
      view: mountChildView,
      viewInputs: {
        toView: published => Bind.div(published.panel, []),
      },
    }),
  ],
)

// TESTS

describe('Scene with a bindView program (Sub/Host boundaries)', () => {
  test('a locator finds content inside a Host island, and clicking a Sub-published handler dispatches the parent-typed Message with its payload', () => {
    Scene.scene(
      { update: subHostUpdate, bindView: subHostRootView },
      Scene.with(subHostInitialModel),
      Scene.expect(Scene.testId('counter-host')).toExist(),
      Scene.expect(Scene.testId('counter-host')).toContainText(
        'Counter host content',
      ),
      Scene.expect(Scene.testId('last-received')).toHaveText('none'),
      Scene.click(Scene.testId('counter-button')),
      Scene.expect(Scene.testId('last-received')).toHaveText('step:5'),
    )
  })

  test('locators/matchers work unchanged for Sub/Host content: role, class, and attr all resolve through the Host island', () => {
    Scene.scene(
      { update: subHostUpdate, bindView: subHostRootView },
      Scene.with(subHostInitialModel),
      Scene.expect(Scene.testId('counter-button')).toHaveHandler('click'),
      Scene.expect(Scene.testId('counter-button')).toExist(),
    )
  })

  test('a nested two-level Sub interaction composes wrapping outward', () => {
    Scene.scene(
      { update: nestedUpdate, bindView: nestedRootView },
      Scene.with(nestedInitialModel),
      Scene.expect(Scene.testId('level1-wrapper')).toExist(),
      Scene.expect(Scene.testId('nested-last-received')).toHaveText('none'),
      Scene.click(Scene.testId('level0-button')),
      Scene.expect(Scene.testId('nested-last-received')).toHaveText(
        JSON.stringify(gotLevel1(gotLevel0(incrementedLevel0(7)))),
      ),
    )
  })

  // NOTE: materialize's `mounts` field carries no `messageMappers` (unlike
  // the html path's `FoldkitMountMarker`) - resolving a bind-path Mount
  // dispatches `resultMessage` directly with no boundary lift, so the
  // result must already be parent-typed.
  test('a Sub-published onMount is tracked by Scene.Mount.expectHas/expectExact, mirroring the html path', () => {
    Scene.scene(
      { update: mountRootUpdate, bindView: mountRootView },
      Scene.with({ child: { isPanelOpen: true } }),
      Scene.Mount.expectHas(mountedPanel),
      Scene.Mount.expectExact(mountedPanel),
      Scene.expect(Scene.testId('mount-panel')).toHaveMount('MountedPanel'),
      Scene.Mount.resolve(mountedPanel, gotMountChild({ _tag: 'MountFired' })),
    )
  })

  test('toHaveMount fails clearly when no such Mount is pending', () => {
    expect(() =>
      Scene.scene(
        { update: mountRootUpdate, bindView: mountRootView },
        Scene.with({ child: { isPanelOpen: true } }),
        Scene.expect(Scene.testId('mount-panel')).toHaveMount('SomeOtherMount'),
      ),
    ).toThrow(/have a pending Mount "SomeOtherMount"/)
  })
})
