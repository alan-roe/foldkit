import { Option, Predicate } from 'effect'
import { describe, it } from 'vitest'

import { mount } from '../../../experimental/bind/render.js'
import { flush } from '../../../experimental/reactive/scheduler.js'
import { makeModelStore } from '../../../experimental/reactive/store.js'
import { type VNode, __patchVNode } from '../../../vdom.js'
import {
  AddedTodos,
  ClearedTodos,
  type Model,
  RetitledTodo,
  ReversedTodos,
  ToggledTodo,
  initialModel,
  makeModelWithTodos,
  update,
} from './app.js'
import { type DomCounts, installDomCounter } from './domCounter.js'
import { view as viewBoundFactory } from './viewBound.js'
import { view as viewSnabbdom } from './viewSnabbdom.js'

/**
 * Comparative bench: old (snabbdom, naive `view` + `__patchVNode`) vs new
 * (fine-grained renderer: `reconcile` + `flush`). Skipped by default. Run
 * with:
 *
 *   RUN_RENDER_BENCH=1 pnpm --filter foldkit exec vitest run src/test/apps/renderCompare/compare.bench.test.ts
 *
 * Pattern mirrors `src/runtime/dispatchBench.test.ts`: an env-gated
 * `describe`, per-run fresh setup outside the timed region, 2 warmup + 8
 * measured runs, median/min/max wall time via `performance.now()`.
 */

// NOTE: reads process.env through globalThis so this browser-typed package
// never needs node type definitions; under vitest the node process global
// is always present.
const readBenchFlag = (): unknown => {
  const nodeProcess: unknown = Reflect.get(globalThis, 'process')
  if (!Predicate.hasProperty(nodeProcess, 'env')) {
    return undefined
  }
  const env = nodeProcess.env
  if (!Predicate.hasProperty(env, 'RUN_RENDER_BENCH')) {
    return undefined
  }
  return env.RUN_RENDER_BENCH
}

const isBenchEnabled = readBenchFlag() === '1'

// SCENARIOS

const TODO_COUNT = 1_000

/** A comparative scenario: `setupModel` builds the pre-timed-region Model
 *  (mounted/patched before the clock starts), `applyMessages` performs the
 *  Message(s) under measurement via `update` and returns the resulting
 *  Model, ready for the single timed render call. */
type Scenario = Readonly<{
  label: string
  setupModel: () => Model
  applyMessages: (model: Model) => Model
}>

const scenarios: ReadonlyArray<Scenario> = [
  {
    label: `create ${TODO_COUNT}`,
    setupModel: () => initialModel,
    applyMessages: model => update(model, AddedTodos({ count: TODO_COUNT }))[0],
  },
  {
    label: `update every 10th of ${TODO_COUNT}`,
    setupModel: () => makeModelWithTodos(TODO_COUNT),
    applyMessages: model => {
      let next = model
      for (let index = 0; index < TODO_COUNT; index += 10) {
        next = update(
          next,
          RetitledTodo({ id: `todo-${index}`, title: `Retitled ${index}` }),
        )[0]
      }
      return next
    },
  },
  {
    label: `toggle 1 of ${TODO_COUNT}`,
    setupModel: () => makeModelWithTodos(TODO_COUNT),
    applyMessages: model =>
      update(model, ToggledTodo({ id: `todo-${TODO_COUNT / 2}` }))[0],
  },
  {
    label: `reverse ${TODO_COUNT}`,
    setupModel: () => makeModelWithTodos(TODO_COUNT),
    applyMessages: model => update(model, ReversedTodos())[0],
  },
  {
    label: `clear ${TODO_COUNT}`,
    setupModel: () => makeModelWithTodos(TODO_COUNT),
    applyMessages: model => update(model, ClearedTodos())[0],
  },
]

// RUNNERS

type RunResult = Readonly<{
  ms: number
  domCounts: DomCounts
  evals: number
}>

const runOldOnce = (scenario: Scenario): RunResult => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const counter = installDomCounter(window)

  let maybeCurrentVNode: Option.Option<VNode> = Option.none()
  const patch = (model: Model): void => {
    const nextDocument = viewSnabbdom(model)
    maybeCurrentVNode = Option.some(
      __patchVNode(maybeCurrentVNode, nextDocument.body, container, new Set()),
    )
  }

  const setupModel = scenario.setupModel()
  patch(setupModel)

  counter.reset()
  const start = performance.now()
  const nextModel = scenario.applyMessages(setupModel)
  patch(nextModel)
  const ms = performance.now() - start
  const domCounts = counter.read()

  counter.uninstall()
  container.remove()

  return { ms, domCounts, evals: 0 }
}

const runNewOnce = (scenario: Scenario): RunResult => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const counter = installDomCounter(window)

  let evalCount = 0
  const setupModel = scenario.setupModel()
  const store = makeModelStore(setupModel)
  const binding = viewBoundFactory()
  const mounted = mount({
    binding,
    view: store.view,
    dispatch: () => {},
    container,
    document,
    onThunkEvaluation: () => {
      evalCount += 1
    },
  })

  counter.reset()
  evalCount = 0
  const start = performance.now()
  const nextModel = scenario.applyMessages(setupModel)
  store.reconcile(nextModel)
  flush()
  const ms = performance.now() - start
  const domCounts = counter.read()
  const evals = evalCount

  mounted.dispose()
  store.dispose()
  counter.uninstall()
  container.remove()

  return { ms, domCounts, evals }
}

// STATISTICS

const median = (samples: ReadonlyArray<number>): number => {
  const sorted = [...samples].sort((sampleA, sampleB) => sampleA - sampleB)
  const middle = Math.floor(sorted.length / 2)
  return sorted[middle] ?? 0
}

const minOf = (samples: ReadonlyArray<number>): number =>
  samples.reduce((min, sample) => Math.min(min, sample), Infinity)

const maxOf = (samples: ReadonlyArray<number>): number =>
  samples.reduce((max, sample) => Math.max(max, sample), -Infinity)

const WARMUP_RUNS = 2
const MEASURED_RUNS = 8

type ScenarioReport = Readonly<{
  label: string
  old: Readonly<{
    medianMs: number
    minMs: number
    maxMs: number
    domOps: number
  }>
  next: Readonly<{
    medianMs: number
    minMs: number
    maxMs: number
    domOps: number
    evals: number
  }>
}>

const measureScenario = (scenario: Scenario): ScenarioReport => {
  for (let index = 0; index < WARMUP_RUNS; index++) {
    runOldOnce(scenario)
  }
  const oldSamples: Array<RunResult> = []
  for (let index = 0; index < MEASURED_RUNS; index++) {
    oldSamples.push(runOldOnce(scenario))
  }

  for (let index = 0; index < WARMUP_RUNS; index++) {
    runNewOnce(scenario)
  }
  const newSamples: Array<RunResult> = []
  for (let index = 0; index < MEASURED_RUNS; index++) {
    newSamples.push(runNewOnce(scenario))
  }

  const oldMs = oldSamples.map(sample => sample.ms)
  const newMs = newSamples.map(sample => sample.ms)

  return {
    label: scenario.label,
    old: {
      medianMs: median(oldMs),
      minMs: minOf(oldMs),
      maxMs: maxOf(oldMs),
      domOps: median(oldSamples.map(sample => sample.domCounts.total)),
    },
    next: {
      medianMs: median(newMs),
      minMs: minOf(newMs),
      maxMs: maxOf(newMs),
      domOps: median(newSamples.map(sample => sample.domCounts.total)),
      evals: median(newSamples.map(sample => sample.evals)),
    },
  }
}

// REPORT

const formatMs = (ms: number): string => ms.toFixed(2)

const renderTable = (reports: ReadonlyArray<ScenarioReport>): string => {
  const header =
    '| Scenario | Old median ms | Old min/max ms | Old DOM ops | New median ms | New min/max ms | New DOM ops | New evals | Median speedup |'
  const separator = '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  const rows = reports.map(report => {
    const speedup =
      report.next.medianMs === 0
        ? Infinity
        : report.old.medianMs / report.next.medianMs
    return (
      `| ${report.label} ` +
      `| ${formatMs(report.old.medianMs)} ` +
      `| ${formatMs(report.old.minMs)} / ${formatMs(report.old.maxMs)} ` +
      `| ${report.old.domOps} ` +
      `| ${formatMs(report.next.medianMs)} ` +
      `| ${formatMs(report.next.minMs)} / ${formatMs(report.next.maxMs)} ` +
      `| ${report.next.domOps} ` +
      `| ${report.next.evals} ` +
      `| ${speedup.toFixed(2)}x |`
    )
  })
  return [header, separator, ...rows].join('\n')
}

// SUITE

describe.skipIf(!isBenchEnabled)('render comparative bench', () => {
  it(
    'measures snabbdom baseline vs fine-grained renderer across scenarios',
    { timeout: 120_000 },
    () => {
      const reports = scenarios.map(measureScenario)
      console.log('\n' + renderTable(reports) + '\n')
    },
  )
})
