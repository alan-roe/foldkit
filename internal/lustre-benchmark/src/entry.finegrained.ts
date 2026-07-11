import { Effect } from 'effect'
import { Command } from 'foldkit'
import { mount } from 'foldkit/experimental/bind/render.js'
import { flush } from 'foldkit/experimental/reactive/scheduler.js'
import { makeModelStore } from 'foldkit/experimental/reactive/store.js'

import { bindView } from './main.finegrained.js'
import {
  AddedTodo,
  CancelledEdit,
  type Message,
  type Model,
  SavedEdit,
  init,
  update,
} from './main.js'

// Fine-grained-rendering entry point for the lustre-benchmark TodoMVC slot.
//
// NOTE: this rAF-batched dispatch loop mirrors the runtime seam's per-tick
// contract (fold pending Messages through `update`, `store.reconcile
// (nextModel)`, then `flush()`; see local://phase3-contract.md item 2)
// without importing `packages/foldkit/src/runtime/runtime.ts`, which does
// far more (routing, DevTools, crash handling, HMR) than a benchmark slot
// needs. Once the runtime seam's `bindView` config lands on
// `makeApplication`/`makeElement`, this file collapses to the same
// `Runtime.run(Runtime.makeApplication({ ..., bindView }))` call
// `entry.ts` and `entry.optimised.ts` already use.

const container = document.getElementById('root')
if (container === null) {
  throw new Error(
    '[foldkit] #root container is missing. Add <div id="root"></div> to index.finegrained.html before booting the fine-grained slot.',
  )
}

const [initialModel] = init()
const store = makeModelStore(initialModel)

let currentModel: Model = initialModel
let pendingMessages: Array<Message> = []
let isFrameScheduled = false

const runCommand = (command: Command.Command<Message>): void => {
  Effect.runPromise(command.effect).then(dispatch)
}

const applyMessage = (message: Message): void => {
  const [nextModel, commands] = update(currentModel, message)
  currentModel = nextModel
  for (const command of commands) {
    runCommand(command)
  }
}

const runFrame = (): void => {
  isFrameScheduled = false
  if (pendingMessages.length === 0) {
    return
  }
  const messages = pendingMessages
  pendingMessages = []
  for (const message of messages) {
    applyMessage(message)
  }
  store.reconcile(currentModel)
  flush()
}

const scheduleFrame = (): void => {
  if (isFrameScheduled) {
    return
  }
  isFrameScheduled = true
  requestAnimationFrame(runFrame)
}

const dispatch = (message: Message): void => {
  pendingMessages.push(message)
  scheduleFrame()
}

mount({
  binding: bindView,
  view: store.view,
  dispatch,
  container,
  document,
})

// NOTE: `on()` always dispatches unconditionally (see main.finegrained.ts),
// so the Enter-only `.new-todo` submit and Enter/Escape-only `.edit`
// save/cancel semantics are attached here as one delegated `keydown`
// listener instead of per-element `on('keydown', ...)` bindings.
container.addEventListener('keydown', (event: KeyboardEvent) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  if (target.classList.contains('new-todo') && event.key === 'Enter') {
    event.preventDefault()
    dispatch(AddedTodo())
    return
  }
  if (!target.classList.contains('edit')) {
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    dispatch(SavedEdit())
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    dispatch(CancelledEdit())
  }
})
