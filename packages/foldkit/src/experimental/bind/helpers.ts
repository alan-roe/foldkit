import type { Binding, Bound } from './binding.js'
import { cond, text } from './binding.js'

// EMPTY BRANCH

/**
 * A `Binding` that renders essentially nothing: an empty text node. `Cond`
 * branches are force-evaluated directly by {@link materialize} (not nested
 * through a list), so an empty `List` is not a safe stand-in here - it
 * would throw materialize's "List must be nested inside an element's
 * children" defect the moment this branch is selected. `text('')` is the
 * smallest `Binding` both `materialize` and the live renderer handle
 * directly; it still sits behind the `Cond`'s own `Comment` anchor at its
 * parent slot, so from the DOM's perspective the branch is empty and
 * comment-anchored.
 */
const emptyBranch = <Model, Message>(): Binding<Model, Message> => text('')

// WHEN

/**
 * A keyed if/else: sugar over {@link cond} using the fixed keys `'True'`/
 * `'False'`, so the live renderer and {@link materialize} both swap branches
 * only when `predicate` flips rather than re-rendering on every read. When
 * anchored region (an empty text node, see {@link emptyBranch}).
 *
 * @example
 * ```typescript
 * when(
 *   model => model.todos.length === 0,
 *   () => text('No todos yet'),
 *   () => el('ul', [], [list(...)]),
 * )
 * ```
 */
export const when = <Model, Message>(
  predicate: Bound<Model, boolean>,
  renderTrue: () => Binding<Model, Message>,
  renderFalse?: () => Binding<Model, Message>,
): Binding<Model, Message> =>
  cond<Model, Message>(
    model => (predicate(model) ? 'True' : 'False'),
    key =>
      key === 'True'
        ? renderTrue()
        : (renderFalse ?? emptyBranch<Model, Message>)(),
  )

// MATCH TAG

/**
 * A discriminated keyed branch: sugar over {@link cond} that dispatches on
 * `select(model)` into `branches` by key. A key with no matching branch is a
 * defect (a bug in `branches`, not a value to recover from at runtime) -
 * the thrown message names the offending key.
 *
 * @example
 * ```typescript
 * matchTag(model => model.filter, {
 *   All: () => list(...),
 *   Active: () => list(...),
 *   Completed: () => list(...),
 * })
 * ```
 */
export const matchTag = <Model, Message>(
  select: Bound<Model, string>,
  branches: Readonly<Record<string, () => Binding<Model, Message>>>,
): Binding<Model, Message> =>
  cond<Model, Message>(select, key => {
    const renderBranch = branches[key]
    if (renderBranch === undefined) {
      throw new Error(`matchTag: no branch for key "${key}"`)
    }
    return renderBranch()
  })
