---
'foldkit': minor
---

Add the Submodel seam to the experimental fine-grained render path. `submodel()` embeds a child Model/update component behind explicit `Sub`/`Host` binding nodes: dispatch and store view are threaded as data through a per-seam frame, child-published attribute groups and bare `Bound` values lift to parent types at the `toView` boundary, and `onMount`/`onUnmount` land as attribute-position bindings with owner-ordered cleanup. Scene gains `toHaveMount`/`toHaveUnmount` support for bind-path programs; materialize pre-composes handler messages across seam boundaries so interactions observe parent-typed Messages unchanged.
