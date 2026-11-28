import { ConfirmDialog } from '@/components/confirm-dialog'

export const STAGE_FORM_ID = 'stage-form'
const FORM_ID = STAGE_FORM_ID

/**
 * The first field with a problem gets the cursor; a missing document, the file chooser. It's
 * scrolled to the middle of the sheet first, so the sticky footer never covers it (or its
 * message, under the chooser).
 */
export function focusFirstError() {
  window.requestAnimationFrame(() => {
    const field = document.querySelector<HTMLElement>(`#${FORM_ID} [aria-invalid="true"]`)
    const target =
      field ??
      document.querySelector<HTMLElement>(`#${FORM_ID} [data-documents] input[type="file"]`)
    const shown = field ?? document.querySelector<HTMLElement>(`#${FORM_ID} [data-documents-error]`)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    shown?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    target?.focus({ preventScroll: true })
  })
}

/** "Discard this update?" from Cancel, Esc, Back or a link while the update has changes. */
export function DiscardUpdateConfirm({
  open,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onKeepEditing()}
      title="Discard this update?"
      confirmLabel="Discard update"
      cancelLabel="Keep editing"
      destructive
      onConfirm={onDiscard}
    >
      Your update isn't saved yet.
    </ConfirmDialog>
  )
}
