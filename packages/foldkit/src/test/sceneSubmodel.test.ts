import { describe, expect, test } from 'vitest'

import {
  clickedBackdrop,
  clickedCloseButton,
  clickedFooterCloseAll,
  gotConfirmDialogMessage,
  panelUnmounted,
  parentInitialModel,
  parentUpdate,
  parentView,
} from './apps/dialogSubmodel.js'
import * as Scene from './scene.js'

// ACCEPTANCE FIXTURE: Dialog-shaped Sub/Host seam (design doc section 9).
// Covers: a child Submodel with its own Model/update, four published attr
// groups, the bare `Bound<Child, boolean>` fourth lift row (`isVisible`), a
// consumer `toView` composing a Host island with parent thunks and a nested
// parent-typed handler, an `UnmountAttr`, interactions asserting
// parent-typed Messages with correct payloads, and a disposal assertion.

describe('Scene acceptance fixture: Dialog Submodel (Sub/Host)', () => {
  test('isVisible (the fourth lift row) gates the Host content: open by default, locators resolve inside it', () => {
    Scene.scene(
      { update: parentUpdate, bindView: parentView },
      Scene.with(parentInitialModel),
      Scene.expect(Scene.testId('dialog-root')).toExist(),
      Scene.expect(Scene.testId('dialog-root')).toHaveAttr('role', 'dialog'),
      Scene.expect(Scene.testId('dialog-panel')).toExist(),
      // A parent thunk inside the Host island: reads the parent Model
      // directly (`confirmTitle`), no lift required.
      Scene.expect(Scene.testId('dialog-panel')).toContainText('Delete item?'),
    )
  })

  test('clicking the close button dispatches the parent-typed Message with the correct child payload, and isVisible then hides the Host content', () => {
    Scene.scene(
      { update: parentUpdate, bindView: parentView },
      Scene.with(parentInitialModel),
      Scene.expect(Scene.testId('last-action')).toHaveText('none'),
      Scene.click(Scene.testId('dialog-close')),
      Scene.expect(Scene.testId('last-action')).toHaveText(
        clickedCloseButton._tag,
      ),
      Scene.expect(Scene.testId('dialog-root')).toBeAbsent(),
    )
  })

  test('clicking the backdrop dispatches a different parent-typed Message with its own payload', () => {
    Scene.scene(
      { update: parentUpdate, bindView: parentView },
      Scene.with(parentInitialModel),
      Scene.click(Scene.testId('dialog-backdrop')),
      Scene.expect(Scene.testId('last-action')).toHaveText(
        clickedBackdrop._tag,
      ),
      Scene.expect(Scene.testId('dialog-root')).toBeAbsent(),
    )
  })

  test('the nested parent-typed handler ("Close All") dispatches directly, with no Sub lift, exactly like an ordinary handler', () => {
    Scene.scene(
      { update: parentUpdate, bindView: parentView },
      Scene.with(parentInitialModel),
      Scene.expect(Scene.testId('dialog-footer-close-all')).toHaveHandler(
        'click',
      ),
      Scene.click(Scene.testId('dialog-footer-close-all')),
      Scene.expect(Scene.testId('last-action')).toHaveText(
        clickedFooterCloseAll._tag,
      ),
      Scene.expect(Scene.testId('dialog-root')).toBeAbsent(),
    )
  })

  // NOTE: Scene never diffs a live DOM (fresh materialize per step, no
  // owner/cleanup effects) - "unmount ordering" here means the
  // materialize-level guarantee Scene *can* prove synchronously: an
  // UnmountAttr's message is present on its node in every render where the
  // node is live (attached strictly coextensively with the node, composed
  // to its final parent-typed form up front - see materialize.ts's `wrap`
  // threading), and disappears in the exact same step the node itself
  // disappears - never dangling before the node exists or lingering after
  // it is gone. The live-DOM "owner cleanups run before DOM detach"
  // ordering is render.ts's guarantee (SeamEngine's render.test.ts), not
  // reproducible without a DOM.
  test('disposal ordering: the UnmountAttr message is attached (parent-typed) while the panel is live, and both vanish together on close', () => {
    Scene.scene(
      { update: parentUpdate, bindView: parentView },
      Scene.with(parentInitialModel),
      Scene.expect(Scene.testId('dialog-panel')).toHaveUnmount(
        gotConfirmDialogMessage(panelUnmounted),
      ),
      Scene.expect(Scene.testId('panel-unmount-count')).toHaveText('0'),
      Scene.click(Scene.testId('dialog-close')),
      // The panel node and its UnmountAttr data are gone together - no
      // dangling unmount marker survives its own node's disappearance.
      Scene.expect(Scene.testId('dialog-panel')).toBeAbsent(),
    )
  })

  test('toHaveUnmount fails clearly when the element carries no onUnmount', () => {
    expect(() =>
      Scene.scene(
        { update: parentUpdate, bindView: parentView },
        Scene.with(parentInitialModel),
        Scene.expect(Scene.testId('dialog-close')).toHaveUnmount(),
      ),
    ).toThrow(/have an onUnmount message/)
  })
})
