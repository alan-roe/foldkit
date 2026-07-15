---
'@foldkit/oxlint-plugin': minor
---

Add `no-derived-in-view-bodies` to the experimental fine-grained `bindView` rule set. Flags `derived(...)` calls made lexically inside a binding-constructing function: a function reachable through the arguments of `list`, `cond`, `when`, `matchTag`, or `submodel`; an object property value named `toView`, `renderItem`, or `renderBranch`; or any function nested inside one of those. Each such function re-runs per row, branch, or render, so a `derived()` call inside it mints a fresh per-call computed that outlives the row or branch it was created for and accumulates until the store is torn down. `derived` is legal at module scope and inside a plain top-level factory function that is not itself passed to one of those constructors.

Ships in the `experimental` preset (`configs.experimental`, `./experimental.json`) alongside `no-eager-bind-reads` and `bind-handlers-no-model-reads`. `configs.all` continues to include every registered rule, this one included.
