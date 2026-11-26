import type { QueryKey } from '@tanstack/react-query'
import { useRef } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { InvitationSheet } from './invitation-sheet'
import { MemberSheet } from './member-sheet'
import type { ListRow } from './team-table'

type Props = {
  /** The row named by `?open=`, if it's on this page. */
  row: ListRow | undefined
  listKey: QueryKey
  onClose: () => void
}

/**
 * The member or invitation sheet for `?open=<id>`, so the back button closes it and a link can
 * open it. Esc or closing returns focus to the row it came from. A row that disappears (removed
 * by someone else) simply closes its sheet.
 */
export function TeamRowSheet({ row, listKey, onClose }: Props) {
  // The last row keeps its content on screen while the sheet slides out.
  const last = useRef(row)
  if (row) last.current = row
  const shown = last.current
  const closeGuard = useRef<(() => boolean) | null>(null)
  const height = useVisualViewportHeight(row !== undefined)

  const frame = {
    height,
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      if (shown) document.querySelector<HTMLElement>(`[data-team-row="${shown.id}"]`)?.focus()
    },
  }

  return (
    <Sheet
      open={row !== undefined}
      onOpenChange={(open) => {
        if (open) return
        if (closeGuard.current && !closeGuard.current()) return
        onClose()
      }}
    >
      {shown?.kind === 'member' && (
        // Keyed by row and role, so a saved change starts the form from the new values.
        <MemberSheet
          key={`${shown.id}:${shown.role.id}`}
          row={shown}
          listKey={listKey}
          onClose={onClose}
          closeGuard={closeGuard}
          {...frame}
        />
      )}
      {shown?.kind === 'invitation' && <InvitationSheet row={shown} {...frame} />}
    </Sheet>
  )
}
