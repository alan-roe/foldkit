# @foldkit/lustre-benchmark

A Foldkit TodoMVC implementation built to run inside the
[lustre-labs/benchmark](https://github.com/lustre-labs/benchmark) harness for
head-to-head performance comparison against other implementations (Alpine, Elm,
Gren, Lustre, React, Solid, Svelte, Vue).

The harness drives every implementation through the same runbook (add 100
todos, toggle each, destroy the first 100 times) using CSS selectors against
standard TodoMVC markup.

## Three slots: naive, optimised, and fine-grained

The package builds three implementation slots, mirroring the harness
convention used by Lustre, Elm, React, Gren, and Svelte. The `Model`,
`Message`, `update`, and `init` are shared across all three; only the view
layer and the code that drives rendering from it differ.

- **`foldkit-<version>`**: naive view from `src/main.ts`. No memoization. Every
  Message rebuilds the entire VNode tree.
- **`foldkit-<version>-optimised`**: optimised view from `src/main.optimised.ts`.
  Uses `createLazy` on the header and footer (depend on a small set of
  primitives) and `createKeyedLazy` per todo item (each todo's VNode is reused
  when its `Todo`, edit state, and edit text are referentially equal to the
  previous render). Snabbdom short-circuits the subtree diff when a lazy slot
  returns its cached VNode.
- **`foldkit-<version>-finegrained`**: fine-grained-rendering view from
  `src/main.finegrained.ts`, described as a `Binding` tree
  (`packages/foldkit/src/experimental/bind/binding.ts`) instead of built via
  the `html` factory. No VNode diffing at all: each dynamic attribute, text
  node, list, and conditional branch is its own reactive render effect that
  writes directly to the DOM when its dependency changes.
  `src/entry.finegrained.ts` drives it with a small rAF-batched dispatch loop
  (`makeModelStore` + `mount` + `flush` from `packages/foldkit/src/experimental`)
  instead of `Runtime.run`, since the runtime's own fine-grained render seam
  (the `bindView` config field) has not shipped yet. See the `NOTE` comments
  in `src/entry.finegrained.ts` for exactly what collapses away once it does.

## Relationship to `examples/todo`

The model layer is intentionally identical. The `Todo` schema, every Message,
the `GenerateTodo` Command, and every preserved `update` branch match
`examples/todo` line-for-line.

The view is rewritten to render the same TodoMVC reference markup every other
implementation in the harness uses, so absolute timings are comparable. The
differences:

- TodoMVC class names on the relevant elements (`new-todo`, `todo-list`,
  `toggle`, `destroy`, etc.) instead of Tailwind utilities.
- TodoMVC `header` / `main` / `footer` structure instead of the original's
  layout.
- Direct `OnKeyDownPreventDefault('Enter')` on `.new-todo` instead of a
  wrapping `<form>` with `OnSubmit`. The harness dispatches a synthetic
  `Event('keydown')`, which doesn't trigger implicit form submission.
- `h.keyed('li')` on todo list items.
- TodoMVC edit interaction: double-click the label to enter edit mode; blur,
  Enter, or Escape exit it.
- TodoMVC delete affordance: empty `<button class="destroy">` (the stylesheet
  supplies the glyph).
- TodoMVC filter affordance: `<a href="#/…">` anchors inside
  `<ul class="filters">`.
- No empty-state copy. Main and footer render nothing when there are no
  todos, matching the TodoMVC convention.

There is also no persistence. The example's `SaveTodos` Command and `flags`
localStorage read are removed because no other implementation in the harness
persists, and the synchronous `localStorage.setItem` plus full-array JSON
encode on every step would add measurable overhead not present in the
comparators.

The mount target for the naive and optimised slots changes from `#root` to
`section.todoapp` to match the harness's `index.html`: the runtime patches
the container element in place, so `section.todoapp` and `#root` end up on
the same element.

The fine-grained slot mounts through `experimental/bind/render.ts`'s
`mount()`, which appends into its container rather than patching it in
place (see `packages/foldkit/src/experimental/bind/render.ts`). To get the
same `section.todoapp` wrapper without doubling it, `index.finegrained.html`
uses a neutral `<div id="root">` and `src/main.finegrained.ts`'s `bindView`
supplies its own `section.todoapp` as the mounted root, matching the
established pattern in `packages/foldkit/src/test/apps/renderCompare`'s bind
fixtures. Every TodoMVC class name and id the harness's runbook selects on
(`new-todo`, `todo-list`, `toggle`, `destroy`, `filters`, etc.) is identical
to the naive and optimised slots; the only structural difference is `#root`
living on the wrapping `div` instead of directly on `section.todoapp`.

## Prerequisites

- The Foldkit monorepo, set up as documented at the repo root.
- A clone of [lustre-labs/benchmark](https://github.com/lustre-labs/benchmark)
  somewhere on disk. See its README for Gleam toolchain setup.

## One-time setup (per Foldkit version)

A fresh `lustre-labs/benchmark` clone has no Foldkit entry, so:

1. Create all three implementation slots. Replace `<version>` with `version`
   from `packages/foldkit/package.json` (for example `foldkit-0.100.1`):

   ```sh
   mkdir -p <lustre-benchmark>/priv/implementations/foldkit-<version>
   mkdir -p <lustre-benchmark>/priv/implementations/foldkit-<version>-optimised
   mkdir -p <lustre-benchmark>/priv/implementations/foldkit-<version>-finegrained
   ```

2. Register all three implementations by adding entries to the JSON block
   inside `<lustre-benchmark>/index.html`. Entries are sorted alphabetically by
   `name`; insert them between `Elm` and `Gren`:

   ```json
   { "name": "Foldkit", "version": "<version>", "optimised": false },
   { "name": "Foldkit", "version": "<version>", "optimised": true },
   { "name": "Foldkit", "version": "<version>-finegrained", "optimised": false }
   ```

   The harness's `optimised` field is a boolean, so the fine-grained slot is
   registered as its own `version` string rather than a third `optimised`
   state; adjust to match whatever convention the harness expects if it
   changes.

## Build and install

From this directory:

```sh
pnpm build
```

That produces three output directories:

- `dist/naive/`: naive view, relative asset URLs, includes the
  `/priv/instrumentation.js` script tag the harness requires.
- `dist/optimised/`: optimised view (using `createLazy` and `createKeyedLazy`),
  same wiring.
- `dist/finegrained/`: fine-grained-rendering view (a `Binding` tree mounted
  and driven without VNode diffing), same wiring.

Copy each into its slot:

```sh
rm -rf <lustre-benchmark>/priv/implementations/foldkit-<version>/dist
cp -R dist/naive <lustre-benchmark>/priv/implementations/foldkit-<version>/dist

rm -rf <lustre-benchmark>/priv/implementations/foldkit-<version>-optimised/dist
cp -R dist/optimised <lustre-benchmark>/priv/implementations/foldkit-<version>-optimised/dist

rm -rf <lustre-benchmark>/priv/implementations/foldkit-<version>-finegrained/dist
cp -R dist/finegrained <lustre-benchmark>/priv/implementations/foldkit-<version>-finegrained/dist
```

To build only one variant, use `pnpm build:naive`, `pnpm build:optimised`, or
`pnpm build:finegrained`.

## Run the benchmark

From the lustre-benchmark clone:

```sh
gleam run -m serve
```

Open the URL it prints and run the benchmark from the page UI. All three
registered Foldkit implementations (naive, optimised, fine-grained) run
through the same add/toggle/destroy runbook and land as separate rows in the
same results table, so their numbers are directly comparable to each other
and to the other frameworks in the harness.

## When Foldkit's version bumps

Bump the slot directory name and the `version` value in the `index.html` entry
to match `packages/foldkit/package.json`. Rebuild and re-copy the dist as
above.
