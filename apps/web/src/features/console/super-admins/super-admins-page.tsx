import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { SuperAdminRow } from '@vento/shared/console'
import { UserPlusIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { lastActiveLabel } from '@/features/team/last-active'
import { formatDate } from '@/lib/format'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import type { SuperAdminsSearch } from '@/routes/console/-search'
import { useConsoleTitle } from '../shell/use-console-title'
import { td, th } from '../ui/back-link'
import { ListError, ListSkeleton } from '../ui/list-states'
import { plural } from '../words'
import { firstName, superAdminsQuery } from './queries'
import { AddSuperAdminSheet, RemoveSuperAdminDialog } from './super-admin-changes'

const SECOND_APPROVER_FROM = 4

/** Super-admins (pattern: list page): who can use the console, add and remove (J-ADM-03). */
export function SuperAdminsPage() {
  useConsoleTitle('Super-admins')
  const phone = useMediaQuery(PHONE_QUERY)
  const search = useSearch({ from: '/console/super-admins' })
  const navigate = useNavigate()
  const list = useQuery(superAdminsQuery())
  const rows = list.data
  const go = (next: SuperAdminsSearch, replace = false) =>
    void navigate({ to: '/console/super-admins', search: next, replace })
  const removing = search.remove
    ? rows?.find((r) => r.userId === search.remove && !r.isYou)
    : undefined

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Super-admins"
        description={rows ? plural(rows.length, 'super-admin') : ' '}
        actions={
          <Button onClick={() => go({ add: true })} className="max-md:h-11">
            <UserPlusIcon aria-hidden />
            Add super-admin
          </Button>
        }
      />
      {list.isError && !rows ? (
        <ListError
          what="Super-admins"
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : !rows ? (
        <ListSkeleton phone={phone} rows={3} />
      ) : (
        <SuperAdminsTable rows={rows} onRemove={(row) => go({ remove: row.userId })} />
      )}
      {rows && rows.length < SECOND_APPROVER_FROM && (
        <p className="text-[13px] text-muted-foreground">
          No second approver is needed while there are fewer than 4 super-admins.
        </p>
      )}
      {search.add && <AddSuperAdminSheet onClose={() => go({}, true)} />}
      {removing && <RemoveSuperAdminDialog row={removing} onClose={() => go({}, true)} />}
    </div>
  )
}

function SuperAdminsTable({
  rows,
  onRemove,
}: {
  rows: readonly SuperAdminRow[]
  onRemove: (row: SuperAdminRow) => void
}) {
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Vento super-admins</caption>
        <colgroup>
          <col className="w-[60%] @2xl:w-[34%]" />
          <col className="hidden @2xl:table-column @2xl:w-[18%]" />
          <col className="hidden @2xl:table-column @2xl:w-[18%]" />
          <col className="hidden @2xl:table-column @2xl:w-[16%]" />
          <col className="w-[40%] @2xl:w-[14%]" />
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
              Granted by
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
                {row.grantedByName ?? 'First super-admin'}
              </td>
              <td className={`${td} hidden text-muted-foreground tabular-nums @2xl:table-cell`}>
                {lastActiveLabel(row.lastConsoleAt)}
              </td>
              <td className={`${td} text-right`}>
                {!row.isYou && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(row)}
                    className="max-md:h-11"
                  >
                    Remove<span className="sr-only"> {firstName(row.name)}</span>
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
