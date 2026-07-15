---
'foldkit': minor
---

Add `derived` to `foldkit/experimental`: a Bound-shaped shared-derivation primitive for the fine-grained render path. `derived(f)` is declared once at module scope; every hole reading it through a store view shares one lazily allocated, pull-based computed per view, so N holes cost exactly one evaluation of `f` per relevant Model change. Raw Models fall back to calling `f` directly, keeping materialize and tests transparent. Creating a derived inside a running render effect throws; creating one after the first bind mount warns.
