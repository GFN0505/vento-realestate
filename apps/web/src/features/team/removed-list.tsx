import type { TeamRemovedRow } from '@vento/shared'
import { UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { preloadInvite, shellUi } from '@/features/shell/shell-ui'
import { formatDate } from '@/lib/format'
import { PersonAvatar } from './team-cells'
import { td, th } from './team-table'

type Props = { rows: readonly TeamRemovedRow[]; canInvite: boolean; phone: boolean }

/** "Removed 12 Nov 2026 by Olumide Bankole". */
export function removedLine(row: TeamRemovedRow): string {
  const when = `Removed ${formatDate(row.removedAt)}`
  return row.removedByName ? `${when} by ${row.removedByName}` : when
}

/**
 * The Removed chip: who left, the role they had, when and by whom. Nobody is reactivated from
 * here; **Invite again** opens the invite sheet with their email and last role filled in.
 */
export function RemovedList({ rows, canInvite, phone }: Props) {
  const again = (row: TeamRemovedRow) =>
    canInvite && (
      <Button
        variant="outline"
        size="sm"
        onPointerEnter={preloadInvite}
        onFocus={preloadInvite}
        onClick={() => shellUi.openInvite({ emails: [row.email], roleId: row.role.id })}
        aria-label={`Invite ${row.name} again`}
        className="max-md:h-11"
      >
        <UserPlusIcon aria-hidden />
        Invite again
      </Button>
    )

  if (phone) {
    return (
      <ul aria-label="Removed people" className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 rounded-[14px] border bg-card p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <PersonAvatar name={row.name} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-[14px]">{row.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {row.email} · was {row.role.name}
                </span>
                <span className="text-muted-foreground text-xs">{removedLine(row)}</span>
              </div>
            </div>
            {again(row)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Removed people</caption>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={`${th} w-[38%]`}>
              Person
            </th>
            <th scope="col" className={`${th} w-[18%]`}>
              Role they had
            </th>
            <th scope="col" className={th}>
              Removed
            </th>
            <th scope="col" className={`${th} w-40`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={td}>
                <div className="flex min-w-0 items-center gap-3">
                  <PersonAvatar name={row.name} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{row.name}</span>
                    <span className="truncate text-muted-foreground text-xs">{row.email}</span>
                  </div>
                </div>
              </td>
              <td className={td}>{row.role.name}</td>
              <td className={`${td} text-muted-foreground`}>{removedLine(row)}</td>
              <td className={`${td} pr-4 text-right`}>{again(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
