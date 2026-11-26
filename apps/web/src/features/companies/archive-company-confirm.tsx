import { useRef } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { dependantsLine } from './archive-words'
import type { ArchiveActions } from './use-archive-company'

/** "Archive Lekki Pearl Estates Ltd?", naming who'd be left with no company. */
export function ArchiveCompanyConfirm({
  actions,
  onArchived,
}: {
  actions: ArchiveActions
  onArchived?: () => void
}) {
  // The last confirm keeps its words while the dialog animates out.
  const last = useRef(actions.confirm)
  if (actions.confirm) last.current = actions.confirm
  const shown = last.current
  return (
    <ConfirmDialog
      open={actions.confirm !== null}
      onOpenChange={(open) => !open && actions.cancelConfirm()}
      title={shown ? `Archive ${shown.company.name}?` : ''}
      confirmLabel="Archive company"
      destructive
      pending={actions.pendingId !== null}
      onConfirm={() => void actions.confirmArchive().then((done) => done && onArchived?.())}
    >
      {shown?.company.type === 'holding'
        ? "It's your holding company, which owns the SPVs and carries shared costs. "
        : ''}
      {shown && shown.members.count > 0 ? `${dependantsLine(shown.members)} ` : ''}Its records stay,
      and you can restore it later.
    </ConfirmDialog>
  )
}
