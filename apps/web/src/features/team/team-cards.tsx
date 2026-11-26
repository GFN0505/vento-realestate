import { ChevronRightIcon } from 'lucide-react'
import { accessLabel, InvitationBadge, PersonAvatar, TwoStepBadge, YouTag } from './team-cells'
import type { ListRow } from './team-table'

type Props = { rows: readonly ListRow[]; onOpen: (row: ListRow) => void }

/**
 * Phones (below 768px): one card per person (avatar, name, role · entity access, then the
 * two-step or invitation badge). A tap opens the sheet full height; actions live there.
 */
export function TeamCards({ rows, onOpen }: Props) {
  return (
    <ul aria-label="Team members and open invitations" className="flex flex-col gap-2">
      {rows.map((row) => {
        const member = row.kind === 'member'
        const title = member ? row.name : row.email
        return (
          <li key={row.id}>
            <button
              type="button"
              data-team-row={row.id}
              onClick={() => onOpen(row)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 text-left outline-none transition-colors active:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <PersonAvatar name={title} invited={!member} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-semibold text-[14px]">{title}</span>
                  {member && row.isYou && <YouTag />}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {row.role.name} · {accessLabel(row.access)}
                </span>
                <span className="flex">
                  {member ? <TwoStepBadge state={row.twoStep} /> : <InvitationBadge row={row} />}
                </span>
              </span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
