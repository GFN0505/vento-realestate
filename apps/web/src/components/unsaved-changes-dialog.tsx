import type { UnsavedGuard } from '@/lib/use-unsaved-guard'
import { ConfirmDialog } from './confirm-dialog'

/** The leave-with-changes confirm for a page guarded by `useUnsavedGuard`. */
export function UnsavedChangesDialog({
  guard,
  title,
  children = "Your changes aren't saved yet.",
}: {
  guard: UnsavedGuard
  /** "Discard changes to Organization?" */
  title: string
  children?: string
}) {
  return (
    <ConfirmDialog
      open={guard.asking}
      onOpenChange={(open) => !open && guard.keepEditing()}
      title={title}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive
      onConfirm={guard.discard}
    >
      {children}
    </ConfirmDialog>
  )
}
