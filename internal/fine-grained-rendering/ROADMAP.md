# Fine-Grained Rendering | Roadmap

Status as of 2026-07-11. Branch: `fine-grained-rendering`. All code lives under
`packages/foldkit/src/experimental/` and `packages/foldkit/src/test/apps/renderCompare/`,
unexported from the public API. The snabbdom path is untouched and remains the
production renderer.

## Why

Today every dirty frame pays `view(model)` plus a snabbdom diff: O(tree) work
regardless of how small the change was. The fine-grained path reconciles each
immutable Model epoch into lazily allocated per-path signals and gives every
dynamic binding its own render effect, so a Message costs work proportional to
its diff. The Model stays the single source of truth; the reactive store is a
derived render cache and never authoritative state.

## Decisions (settled)

1. View contract: explicit thunks at dynamic positions (`text((m) => m.count)`),
   never proxy-tracked implicit reads. Read placement is semantic; thunks keep
   the deref visible, greppable, and lintable.
2. Engine: in-house minimal core with algorithms ported from SolidJS `next`
   (reconcile with referential short-circuit, lazy per-path signals, owner
   scopes). Leaves compare via Effect `Equal.equals` so re-allocated but
   value-equal Options never fire. Flush is explicit and driven by the render
   loop, not a foreign microtask scheduler.
3. Store discipline, five invariants, each pinned by a test: single writer
   (only `reconcile`), rebuildable from the current Model at any time,
   idempotent reconcile, snapshot reads per effect run, time-travel is
   reprocessing (`reconcile(historicalModel)`).
4. Migration: branch by abstraction at the view seam. The snabbdom renderer is
   transient with an explicit deletion step gated on a fitness function, not a
   date. The synchronous test materializer is permanent and preserves the
   Scene testing story.
5. Measurement: deterministic work counts gate in CI (DOM ops, thunk
   evaluations); wall-clock truth comes from external browser harnesses.

## Done

- Reactive core: signal, owner tree, render effects with dynamic dependency
  re-tracking, explicit-flush scheduler.
- Model store: deep lazy proxy, per-key signals on tracked reads only,
  `reconcile` as sole writer, `evo()` structural sharing exploited via
  reference short-circuit.
- Binding tree: `el` / `text` / `attr` / `on` / `list` / `cond` constructors,
  pure synchronous `materialize` for DOM-free tests.
- Live renderer: one effect per binding, keyed list rows in disposable owner
  scopes, cond branches at comment anchors, last-written-value memo before any
  DOM write.
- Fitness gates, all holding at contract thresholds: header change in a
  5,000-row page is exactly 1 text write; toggling 1 row of 1,000 is at most
  2 attribute writes; reversing 1,000 rows preserves every row element; an
  identical-Model reconcile writes nothing.
- Fidelity: one deterministic Message script produces normalized-identical DOM
  on both renderers at every step, and the materializer agrees at every step.
- Comparative bench (happy-dom, 1,000 todos, median of 8 runs):

| Scenario          | snabbdom | fine-grained     | DOM ops old vs new | speedup |
| ----------------- | -------- | ---------------- | ------------------ | ------- |
| create 1,000      | 45.5 ms  | 23.1 ms          | 8,334 vs 4,007     | 2.0x    |
| update every 10th | 28.2 ms  | 5.2 ms           | 100 vs 100         | 5.4x    |
| toggle 1 of 1,000 | 26.2 ms  | 3.6 ms (min 0.9) | 1 vs 2             | 7.2x    |
| reverse 1,000     | 37.9 ms  | 12.1 ms          | 999 vs 999         | 3.1x    |
| clear 1,000       | 4.1 ms   | 4.7 ms           | 1,000 vs 1,000     | 0.88x   |

Deterministic counts are stable across runs; happy-dom wall medians for the
sub-millisecond scenarios are noisy (toggle's minimum holds near 0.8 ms while
its median absorbs GC debt from neighboring scenarios). Browser wall-clock
truth comes from the lustre-benchmark slot below.

- Template-clone row instantiation (Solid derives this from its compiler; we
  derive the static skeleton from the binding tree at runtime, cached per List
  and document, instantiated via one `cloneNode(true)` per row). Create-path
  DOM calls dropped 64 percent. Rows rooted directly in a nested List or Cond
  fall back to direct construction.
- Teardown via intrusive doubly-linked owner children and dependency edges per
  solid-signals, plus an empty-selection List fast path. Disposal of 1,000
  rows is now sub-millisecond; the remaining clear-all gap is the per-node
  `removeChild` floor shared with the old path.
- Runtime seam: `makeApplication` and `makeElement` accept `bindView` as a
  type-level either-or with `view` (runtime backstop for untyped callers).
  First render mounts the binding tree against the Model store; every later
  tick is `reconcile` plus `flush`, measured as new slow phases `Reconcile`
  and `Flush`. Dispatch reaches listeners through one stable function
  delegating to a swappable target, so pause and replay never re-mount.
  deepFreeze compatibility pinned by test.
- Scene dual-target: `bindView` programs run through the pure materializer
  adapted to the VNode shape Scene already walks. Locators, matchers,
  interactions, and keyed assertions work unchanged; `toHaveHook` fails with
  an explicit message on the fine-grained path instead of passing silently.
- Bind surface at `foldkit/experimental`: control-flow helpers `when` and
  `matchTag`, ergonomic tag constructors, PascalCase attribute conveniences
  matching the html factory (`Class`, `Id`, `Type`, `For`, ...).
- Browser slot: `internal/lustre-benchmark` builds a third `finegrained`
  variant (90 kB vs 229 kB for the snabbdom slots) with selector-identical
  TodoMVC markup and a thin rAF loop standing in for the runtime seam.
- oxlint rules `no-eager-bind-reads` and `bind-handlers-no-model-reads` in a
  new `experimental` preset of `@foldkit/oxlint-plugin`.
- DevTools time travel verified end-to-end on the bindView path: jumpTo
  reconciles historical Models through the same DOM nodes, clicks during
  pause are swallowed, resume restores live dispatch and exact live DOM, and
  the store's allocated signal count stays flat across repeated history
  sweeps.
- Browser wall-clock (lustre-benchmark runbook, headless Chromium, 100 items,
  add/toggle/destroy, two runs with consistent ordering; second warmer run
  shown):

| Implementation              | Total    |
| --------------------------- | -------- |
| Svelte 5.25.7 (optimised)   | 59.2 ms  |
| Elm 0.19.1 (optimised)      | 74.8 ms  |
| Solid 1.9.5                 | 95.7 ms  |
| Lustre 5.5.0 (optimised)    | 99.5 ms  |
| Foldkit 0.127.0-finegrained | 104.5 ms |
| Vue 3.5.13                  | 129.0 ms |
| React 19.1.0 (optimised)    | 143.2 ms |
| Foldkit 0.127.0 (optimised) | 270.3 ms |
| Foldkit 0.127.0 (naive)     | 540.7 ms |

The fine-grained slot lands in the Solid and Lustre tier (within 10 percent
of Solid), 2.6x faster than the optimised snabbdom slot and 5.2x faster than
the naive one, ahead of Vue and React. Single-machine directional numbers,
not a controlled rig.

## Remaining

- js-framework-benchmark keyed entry for standardized cross-framework
  numbers.
- Migration epic: unify authoring on the existing `html<Message>()` surface
  (bindings subsume `createLazy` / `createKeyedLazy`), migrate the example
  apps, then swap the lustre finegrained slot's hand-rolled loop to
  `makeElement` with `bindView`.
- Deletion of the snabbdom path once the exit fitness function is green across
  the example apps.

## Running it

```sh
pnpm --filter foldkit exec vitest run src/experimental src/test/apps/renderCompare
RUN_RENDER_BENCH=1 pnpm --filter foldkit exec vitest run \
  src/test/apps/renderCompare/compare.bench.test.ts --reporter=verbose
```
