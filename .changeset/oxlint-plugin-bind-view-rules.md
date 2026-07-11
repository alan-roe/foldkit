---
'@foldkit/oxlint-plugin': minor
---

Add two rules for the experimental fine-grained `bindView` surface: `no-eager-bind-reads` flags a Model read that reaches a binding constructor's `Bound<Model, A>` argument (`text`, `attr`, `list`, `cond`, `when`, `matchTag`) without being read live inside a thunk, including the canonical staleness bug where a Model field is captured to a local const outside the thunk and the thunk closes over the frozen local instead of the Model. `bind-handlers-no-model-reads` flags any reference to the Model from inside an `on(event, handler)` handler body, since handlers run later against a Model that may have moved on; handlers must derive their Message payload from the event or from values captured before the handler was defined.

Both rules only fire in files that import binding constructors from an `.../experimental/bind` module or the `Bind` namespace re-exported from `foldkit/experimental`, and are inert everywhere else.

They ship in a new `experimental` preset (`configs.experimental`, `./experimental.json`) instead of `recommended`, since the Bind view surface itself is experimental. `configs.all` continues to include every registered rule, these two included.
