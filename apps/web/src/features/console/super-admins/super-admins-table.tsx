import type { SuperAdminRow } from '@vento/shared/console'
import { EllipsisIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { lastActiveLabel } from '@/features/team/last-active'
import { formatDate } from '@/lib/format'
import { td, th } from '../ui/back-link'

type Props = {
  rows: readonly SuperAdminRow[]
  onRemove: (row: SuperAdminRow) => void
  onReset: (row: SuperAdminRow) => void
}

/**
 * Person, since, invited by and last console use; a row ⋯ with **Reset two-step** and
 * **Remove**, never on your own row. Narrow tables fold the dates under the name.
 */
export function SuperAdminsTable({ rows, onRemove, onReset }: Props) {
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Vento Real Estate super-admins</caption>
        <colgroup>
          <col className="w-[80%] @2xl:w-[36%]" />
          <col className="hidden @2xl:table-column @2xl:w-[18%]" />
          <col className="hidden @2xl:table-column @2xl:w-[20%]" />
          <col className="hidden @2xl:table-column @2xl:w-[18%]" />
          <col className="w-[20%] @2xl:w-[8%]" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              Person
            </th>
            <th scope="col" className={`${th} hidden @2xl:table-cell`}>
              Since
            </th>
            <th scope="col" className={`${th} hidden @2xl:table-cell`}>
              Invited by
            </th>
            <th scope="col" className={`${th} hidden @2xl:table-cell`}>
              Last console use
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.userId} data-testid="super-admin-row">
              <td className={td}>
                <div className="flex min-w-0 flex-col py-2">
                  <span className="truncate font-semibold">
                    {row.name}
                    {row.isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">{row.email}</span>
                  <span className="text-muted-foreground text-xs @2xl:hidden">
                    Since {formatDate(row.since)} · last used{' '}
                    {lastActiveLabel(row.lastConsoleAt).toLowerCase()}
                  </span>
                </div>
              </td>
              <td className={`${td} hidden tabular-nums @2xl:table-cell`}>
                {formatDate(row.since)}
              </td>
              <td className={`${td} hidden truncate text-muted-foreground @2xl:table-cell`}>
                {row.grantedByName ?? 'Vento Real Estate (setup)'}
              </td>
              <td className={`${td} hidden text-muted-foreground tabular-nums @2xl:table-cell`}>
                {lastActiveLabel(row.lastConsoleAt)}
              </td>
              <td className={`${td} text-right`}>
                {!row.isYou && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${row.name}`}
                        className="size-8 max-md:size-11"
                      >
                        <EllipsisIcon aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {row.canResetTwoStep && (
                        <DropdownMenuItem onSelect={() => onReset(row)}>
                          Reset two-step
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => onRemove(row)}
                        className="text-destructive focus:text-destructive"
                      >
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
