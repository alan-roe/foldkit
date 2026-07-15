import * as Bind from '../../experimental/bind/public.js'

// CHILD: Dialog Submodel - owns its own Model/update, publishes attribute
// groups and one bare `Bound<Model, boolean>` leaf (`isVisible`, the fourth
// lift row) for the consumer's `toView` to compose.

export type DialogModel = Readonly<{
  isOpen: boolean
}>

export type DialogMessage =
  | Readonly<{ _tag: 'ClickedBackdrop' }>
  | Readonly<{ _tag: 'ClickedCloseButton' }>
  | Readonly<{ _tag: 'PanelUnmounted' }>

export const clickedBackdrop: DialogMessage = { _tag: 'ClickedBackdrop' }
export const clickedCloseButton: DialogMessage = { _tag: 'ClickedCloseButton' }
export const panelUnmounted: DialogMessage = { _tag: 'PanelUnmounted' }

export const dialogInitialModel: DialogModel = { isOpen: true }

export const dialogUpdate = (
  model: DialogModel,
  message: DialogMessage,
): readonly [DialogModel, ReadonlyArray<never>] => {
  switch (message._tag) {
    case 'ClickedBackdrop':
      return [{ ...model, isOpen: false }, []]
    case 'ClickedCloseButton':
      return [{ ...model, isOpen: false }, []]
    case 'PanelUnmounted':
      return [model, []]
  }
}

const isVisible: Bind.Bound<DialogModel, boolean> = model => model.isOpen

export type DialogShape = Readonly<{
  dialog: ReadonlyArray<Bind.AttrBinding<DialogModel, DialogMessage>>
  backdrop: ReadonlyArray<Bind.AttrBinding<DialogModel, DialogMessage>>
  panel: ReadonlyArray<Bind.AttrBinding<DialogModel, DialogMessage>>
  closeButton: ReadonlyArray<Bind.AttrBinding<DialogModel, DialogMessage>>
  isVisible: Bind.Bound<DialogModel, boolean>
}>

/** The Dialog's own view: four published attribute groups (`dialog`,
 *  `backdrop`, `panel`, `closeButton`) plus the bare `isVisible` leaf value,
 *  forwarded straight to the consumer's `toView`. `panel` carries an
 *  `onUnmount` - the acceptance fixture's UnmountAttr. */
export const dialogView = (
  viewInputs: Readonly<{
    toView: (published: DialogShape) => Bind.Binding<DialogModel, DialogMessage>
  }>,
): Bind.Binding<DialogModel, DialogMessage> =>
  viewInputs.toView({
    dialog: [
      Bind.attr('role', 'dialog'),
      Bind.attr('data-testid', 'dialog-root'),
    ],
    backdrop: [
      Bind.attr('data-testid', 'dialog-backdrop'),
      Bind.on('click', () => clickedBackdrop),
    ],
    panel: [
      Bind.attr('data-testid', 'dialog-panel'),
      Bind.onUnmount(panelUnmounted),
    ],
    closeButton: [
      Bind.attr('data-testid', 'dialog-close'),
      Bind.on('click', () => clickedCloseButton),
    ],
    isVisible,
  })

// PARENT: embeds the Dialog via `Bind.submodel`, composing a Host island
// that mixes parent thunks (the title) with a nested parent-typed handler
// (the "Close All" button, authored directly - no lift needed).

export type ParentModel = Readonly<{
  confirmDialog: DialogModel
  confirmTitle: string
  lastAction: string
  panelUnmountCount: number
}>

export type ParentMessage =
  | Readonly<{ _tag: 'GotConfirmDialogMessage'; message: DialogMessage }>
  | Readonly<{ _tag: 'ClickedFooterCloseAll' }>

export const gotConfirmDialogMessage = (
  message: DialogMessage,
): ParentMessage => ({ _tag: 'GotConfirmDialogMessage', message })

export const clickedFooterCloseAll: ParentMessage = {
  _tag: 'ClickedFooterCloseAll',
}

export const parentInitialModel: ParentModel = {
  confirmDialog: dialogInitialModel,
  confirmTitle: 'Delete item?',
  lastAction: 'none',
  panelUnmountCount: 0,
}

export const parentUpdate = (
  model: ParentModel,
  message: ParentMessage,
): readonly [ParentModel, ReadonlyArray<never>] => {
  switch (message._tag) {
    case 'GotConfirmDialogMessage': {
      const [nextDialog] = dialogUpdate(model.confirmDialog, message.message)
      const panelUnmountCount =
        message.message._tag === 'PanelUnmounted'
          ? model.panelUnmountCount + 1
          : model.panelUnmountCount
      return [
        {
          ...model,
          confirmDialog: nextDialog,
          lastAction: message.message._tag,
          panelUnmountCount,
        },
        [],
      ]
    }
    case 'ClickedFooterCloseAll':
      return [
        {
          ...model,
          confirmDialog: { ...model.confirmDialog, isOpen: false },
          lastAction: 'ClickedFooterCloseAll',
        },
        [],
      ]
  }
}

export const parentView: Bind.Binding<ParentModel, ParentMessage> = Bind.div(
  [Bind.attr('class', 'app')],
  [
    Bind.submodel<
      ParentModel,
      ParentMessage,
      DialogModel,
      DialogMessage,
      DialogShape
    >({
      select: (model: ParentModel) => model.confirmDialog,
      toMessage: gotConfirmDialogMessage,
      view: dialogView,
      viewInputs: {
        toView: published =>
          Bind.when(
            published.isVisible,
            () =>
              Bind.div(published.dialog, [
                Bind.div(published.backdrop, []),
                Bind.div(published.panel, [
                  // A parent thunk: reads the parent Model directly, no lift.
                  Bind.h2([], [Bind.text(model => model.confirmTitle)]),
                  Bind.button(published.closeButton, [Bind.text('Close')]),
                  // A nested parent-typed handler, authored directly inside
                  // the Host island - not part of any published group.
                  Bind.button(
                    [
                      Bind.attr('data-testid', 'dialog-footer-close-all'),
                      Bind.on('click', () => clickedFooterCloseAll),
                    ],
                    [Bind.text('Close All')],
                  ),
                ]),
              ]),
            () => Bind.text(''),
          ),
      },
    }),
    Bind.p(
      [Bind.attr('data-testid', 'last-action')],
      [Bind.text(model => model.lastAction)],
    ),
    Bind.p(
      [Bind.attr('data-testid', 'panel-unmount-count')],
      [Bind.text(model => String(model.panelUnmountCount))],
    ),
  ],
)
