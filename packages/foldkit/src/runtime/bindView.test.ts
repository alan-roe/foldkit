import { Effect, Fiber, Match as M, Schema as S } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Command } from '../command/index.js'
import { el, on, text } from '../experimental/bind/binding.js'
import { m } from '../message/index.js'
import type { SlowContext } from './runtime.js'
import { makeApplication, makeElement } from './runtime.js'

// FIXTURES: a bump-label app shared by the makeElement scenarios.

const ClickedBump = m('ClickedBump')
const Message = S.Union([ClickedBump])
type Message = typeof Message.Type

const Model = S.Struct({ label: S.String })
type Model = typeof Model.Type
const update = (
  _model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command<Message>>]>(),
    M.tagsExhaustive({
      ClickedBump: () => [{ label: 'world' }, []],
    }),
  )

const bumpBindView = el<Model, Message>(
  'div',
  [],
  [
    text(bumpModel => bumpModel.label),
    el('button', [on('click', () => ClickedBump())], [text('bump')]),
  ],
)

// FIXTURES: a counter app for the makeApplication bound-title scenario.

const ClickedIncrement = m('ClickedIncrement')
const CountMessage = S.Union([ClickedIncrement])
type CountMessage = typeof CountMessage.Type

const CountModel = S.Struct({ count: S.Number })
type CountModel = typeof CountModel.Type

const countUpdate = (
  model: CountModel,
  message: CountMessage,
): readonly [CountModel, ReadonlyArray<Command<CountMessage>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [CountModel, ReadonlyArray<Command<CountMessage>>]
    >(),
    M.tagsExhaustive({
      ClickedIncrement: () => [{ count: model.count + 1 }, []],
    }),
  )

const HOST_TITLE = 'Host Page Title'

let container: HTMLElement
let runningFiber: Fiber.Fiber<void> | null = null

beforeEach(() => {
  document.title = HOST_TITLE
  container = document.createElement('div')
  container.id = 'app'
  document.body.appendChild(container)
})

afterEach(async () => {
  if (runningFiber !== null) {
    await Effect.runPromise(Fiber.interrupt(runningFiber))
    runningFiber = null
  }
  document.body.innerHTML = ''
  document.title = HOST_TITLE
})

describe('bindView', () => {
  it('boots makeElement via the fine-grained path and a click updates exactly the bound text', async () => {
    const application = makeElement<Model, Message>({
      Model,
      init: () => [{ label: 'hello' }, []],
      update,
      bindView: bumpBindView,
      container,
      devTools: false,
    })

    runningFiber = Effect.runFork(application.start())

    await vi.waitFor(() => {
      expect(container.textContent).toContain('hello')
    })

    const buttonBefore = container.querySelector('button')
    expect(buttonBefore).not.toBeNull()

    buttonBefore?.click()

    await vi.waitFor(() => {
      expect(container.textContent).toContain('world')
    })
    expect(container.textContent).not.toContain('hello')

    // NOTE: same button element reference after the update proves the
    // fine-grained path wrote only the bound text node, never rebuilt the
    // surrounding structure the way a full snabbdom re-render would.
    expect(container.querySelector('button')).toBe(buttonBefore)
  })

  it('dies with a clear defect when both view and bindView are provided', () => {
    expect(() =>
      makeElement<Model, Message>({
        Model,
        init: () => [{ label: 'hello' }, []],
        update,
        view: () => text('unused') as never,
        bindView: bumpBindView,
        container,
        devTools: false,
      } as never),
    ).toThrow(/exactly one of `view` or `bindView`/)
  })

  it('dies with a clear defect when neither view nor bindView is provided', () => {
    expect(() =>
      makeElement<Model, Message>({
        Model,
        init: () => [{ label: 'hello' }, []],
        update,
        container,
        devTools: false,
      } as never),
    ).toThrow(/exactly one of `view` or `bindView`/)
  })

  it('reconciles cleanly against a frozen Model (dev-mode maybeFreezeModel on)', async () => {
    const observedFrozenFlags: Array<boolean> = []
    const observingUpdate = (
      model: Model,
      message: Message,
    ): readonly [Model, ReadonlyArray<Command<Message>>] => {
      observedFrozenFlags.push(Object.isFrozen(model))
      return update(model, message)
    }

    const application = makeElement<Model, Message>({
      Model,
      init: () => [{ label: 'hello' }, []],
      update: observingUpdate,
      bindView: bumpBindView,
      container,
      devTools: false,
    })

    runningFiber = Effect.runFork(application.start())

    await vi.waitFor(() => {
      expect(container.textContent).toContain('hello')
    })

    const button = container.querySelector('button')

    // Two reconcile passes against a frozen Model: store internals must
    // never throw, and every processed Model is confirmed frozen so this
    // is actually exercising the dev-mode `maybeFreezeModel` path.
    button?.click()
    await vi.waitFor(() => {
      expect(container.textContent).toContain('world')
    })
    button?.click()
    await vi.waitFor(() => {
      expect(observedFrozenFlags.length).toBeGreaterThanOrEqual(1)
    })

    expect(observedFrozenFlags.every(isFrozen => isFrozen)).toBe(true)
  })

  it('fires Reconcile and Flush slow phases on the bindView path, never View or Patch', async () => {
    const contexts: Array<SlowContext<Model, Message>> = []

    const application = makeElement<Model, Message>({
      Model,
      init: () => [{ label: 'hello' }, []],
      update,
      bindView: bumpBindView,
      container,
      devTools: false,
      slow: {
        show: 'Always',
        onSlow: context => {
          contexts.push(context)
        },
        thresholdOverrides: {
          Reconcile: -1,
          Flush: -1,
        },
      },
    })

    runningFiber = Effect.runFork(application.start())

    await vi.waitFor(() => {
      expect(container.textContent).toContain('hello')
    })

    // The mount (first render) never measures Reconcile/Flush; only a
    // subsequent tick does.
    expect(contexts.length).toBe(0)

    container.querySelector('button')?.click()

    await vi.waitFor(() => {
      expect(contexts.some(context => context._tag === 'Flush')).toBe(true)
    })

    const tags = contexts.map(context => context._tag)
    expect(tags).toContain('Reconcile')
    expect(tags).toContain('Flush')
    expect(tags).not.toContain('View')
    expect(tags).not.toContain('Patch')
  })

  it('disposes the store and mounted tree on runtime teardown', async () => {
    const application = makeElement<Model, Message>({
      Model,
      init: () => [{ label: 'hello' }, []],
      update,
      bindView: bumpBindView,
      container,
      devTools: false,
    })

    runningFiber = Effect.runFork(application.start())

    await vi.waitFor(() => {
      expect(container.textContent).toContain('hello')
    })

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await Effect.runPromise(Fiber.interrupt(runningFiber))
    runningFiber = null

    // Dispose tears down the mounted owner tree, which removes every
    // listener registered under it. A click that used to dispatch
    // `ClickedBump` is now inert - the strongest observable proof that
    // `mounted.dispose()` (and not just process exit) actually ran.
    button?.click()
    expect(container.textContent).not.toContain('world')
  })

  it('updates document.title from a Bound bindView title in makeApplication', async () => {
    const application = makeApplication<CountModel, CountMessage>({
      Model: CountModel,
      init: () => [{ count: 0 }, []],
      update: countUpdate,
      bindView: {
        title: model => `Count: ${model.count}`,
        body: el<CountModel, CountMessage>(
          'div',
          [],
          [
            text(model => `count:${model.count}`),
            el(
              'button',
              [on('click', () => ClickedIncrement())],
              [text('increment')],
            ),
          ],
        ),
      },
      container,
      devTools: false,
    })

    runningFiber = Effect.runFork(application.start())

    await vi.waitFor(() => {
      expect(document.title).toBe('Count: 0')
    })

    container.querySelector('button')?.click()

    await vi.waitFor(() => {
      expect(document.title).toBe('Count: 1')
    })
  })
})
