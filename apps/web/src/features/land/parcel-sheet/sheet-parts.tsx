import type { ReactNode, RefObject } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'

/** Asks before the sheet closes; null when there's nothing to lose. */
export type Guard = RefObject<(() => boolean) | null>

/**
 * Sticks to the foot of the sheet's scrolling body, so the main button stays above a keyboard.
 * `-bottom-5` cancels the body's bottom padding: with `bottom-0` a long form showed through below.
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex flex-col gap-3 border-t bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
      {children}
    </div>
  )
}

/** "Discard your changes?" before a dirty sheet closes. */
export function DiscardParcelConfirm({
  open,
  onOpenChange,
  adding,
  onDiscard,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  adding: boolean
  onDiscard: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Discard your changes?"
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      onConfirm={onDiscard}
    >
      {adding
        ? "This parcel isn't added yet. Files you dropped in won't be kept."
        : "Your changes to this parcel aren't saved yet."}
    </ConfirmDialog>
  )
}
