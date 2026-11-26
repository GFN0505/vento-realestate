import type { TeamInvitationRow, TeamMemberRow } from '@vento/shared'
import { lastActiveLabel } from './last-active'
import { RoleMenu } from './role-menu'
import { RowMenu } from './row-menu'
import { AccessText, InvitationBadge, PersonAvatar, TwoStepBadge, YouTag } from './team-cells'

export type ListRow = TeamMemberRow | TeamInvitationRow

type Props = { rows: readonly ListRow[]; onOpen: (row: ListRow) => void }

export const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5'
export const td = 'h-[60px] px-3 align-middle first:pl-5'

/**
 * Members and open invitations (board RolesSettings, users tab, with the spec's columns). A plain
 * table: at most 50 rows, no sorting. The row opens its sheet; the name is its keyboard target.
 * Narrow containers drop Last active, and an invitation's badge moves into the Two-step column.
 */
export function TeamTable({ rows, onOpen }: Props) {
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Team members and open invitations</caption>
        <colgroup>
          <col className="w-[29%] @3xl:w-[26%]" />
          <col className="w-[22%] @3xl:w-[19%]" />
          <col className="w-[21%] @3xl:w-[16%]" />
          <col className="w-[28%] @3xl:w-[18%]" />
          <col className="hidden @3xl:table-column @3xl:w-[21%]" />
          <col className="w-12" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              Person
            </th>
            <th scope="col" className={th}>
              Role
            </th>
            <th scope="col" className={th}>
              Entity access
            </th>
            <th scope="col" className={th}>
              Two-step
            </th>
            <th scope="col" className={`${th} hidden @3xl:table-cell`}>
              Activity
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={(event) => {
                // The row opens its sheet, unless the click was meant for a control in it (menus,
                // the names tooltip) or came through a portal (a menu item).
                const target = event.target as Element
                if (!event.currentTarget.contains(target) || target.closest(INTERACTIVE)) return
                onOpen(row)
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className={td}>
                <Person row={row} onOpen={() => onOpen(row)} />
              </td>
              <td className={td}>
                {row.kind === 'member' && row.can.changeAccess ? (
                  <RoleMenu row={row} />
                ) : (
                  <span className="block truncate">{row.role.name}</span>
                )}
              </td>
              <td className={`${td} text-muted-foreground`}>
                <AccessText access={row.access} className="block truncate" />
              </td>
              <td className={td}>
                {row.kind === 'member' ? (
                  // "Reset, waiting for new password" may wrap in a narrow column.
                  <TwoStepBadge state={row.twoStep} className="whitespace-normal" />
                ) : (
                  <span className="@3xl:hidden">
                    <InvitationBadge row={row} />
                  </span>
                )}
                {row.kind === 'invitation' && (
                  <span aria-hidden className="hidden text-muted-foreground @3xl:inline">
                    –
                  </span>
                )}
              </td>
              <td className={`${td} hidden tabular-nums @3xl:table-cell`}>
                {row.kind === 'member' ? (
                  <span className="text-muted-foreground">{lastActiveLabel(row.lastActiveAt)}</span>
                ) : (
                  <InvitationBadge row={row} />
                )}
              </td>
              <td className={`${td} pr-3 text-right`}>
                <RowMenu row={row} onOpen={() => onOpen(row)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const INTERACTIVE = 'button, a, input, [role="menuitem"], [role="menuitemradio"]'

function Person({ row, onOpen }: { row: ListRow; onOpen: () => void }) {
  const member = row.kind === 'member'
  const title = member ? row.name : row.email
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={title} invited={!member} />
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            data-team-row={row.id}
            onClick={onOpen}
            className="truncate rounded-sm text-left font-semibold outline-none hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {title}
          </button>
          {member && row.isYou && <YouTag />}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {member ? row.email : `Invited by ${row.invitedByName}`}
        </span>
      </div>
    </div>
  )
}
