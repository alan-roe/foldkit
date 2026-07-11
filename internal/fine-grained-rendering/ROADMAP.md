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

## Remaining

- Runtime seam: renderer switch in `makeApplication` / `makeElement`; render
  loop tick becomes `reconcile` + `flush`; deepFreeze boundary decision (store
  keeps a private unfrozen copy).
- Scene integration: the materializer as Scene's render target; port
  `toHaveHook` / `toHaveHandler` matchers.
- html factory seam: express bindings through the existing `html<Message>()`
  surface so apps do not import a parallel API; bindings subsume
  `createLazy` / `createKeyedLazy` on the new path.
- Control-flow ergonomics: keyed branch and list helpers consistent with the
  keyed-view conventions in AGENTS.md.
- Browser wall-clock truth: third slot `foldkit-<version>-finegrained` in
  `internal/lustre-benchmark`; later a js-framework-benchmark keyed entry.
- Slow instrumentation: Reconcile and Flush phases with thresholds.
- oxlint rules: no eager Model reads in view bodies outside thunks; handlers
  close over stable keys only.
- DevTools: time travel through `reconcile(snapshot)`; pause semantics.
- Deletion of the snabbdom path once the exit fitness function is green across
  the example apps.

## Running it

```sh
pnpm --filter foldkit exec vitest run src/experimental src/test/apps/renderCompare
RUN_RENDER_BENCH=1 pnpm --filter foldkit exec vitest run \
  src/test/apps/renderCompare/compare.bench.test.ts --reporter=verbose
```
