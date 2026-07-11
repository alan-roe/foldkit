---
'foldkit': minor
---

Add an experimental fine-grained render path. `makeApplication` and `makeElement` accept a `bindView` alternative to `view`: a Binding tree whose thunks read the Model through lazily allocated per-path signals, so each dispatch performs work proportional to the Model diff instead of rebuilding and diffing the whole view. New `Bind` namespace at `foldkit/experimental` exposes the binding constructors (`el`, `text`, `attr`, `on`, `list`, `cond`), control-flow helpers (`when`, `matchTag`), ergonomic tag constructors, and the pure `materialize` used by tests. Scene accepts `bindView` programs with unchanged locators, matchers, and interaction steps. Slow warnings gain `Reconcile` and `Flush` phases on the new path. DevTools time travel replays history through store reconciliation. The snabbdom path is unchanged and remains the default.
