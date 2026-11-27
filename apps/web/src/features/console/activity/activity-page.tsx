import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { HistoryIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { TeamPagination } from '@/features/team/team-pagination'
import { cn } from '@/lib/utils'
import type { ActivitySearch } from '@/routes/console/-search'
import { useConsoleTitle } from '../shell/use-console-title'
import { FilteredEmpty, ListEmpty, ListError, ListSkeleton } from '../ui/list-states'
import { ActivityFilters } from './activity-filters'
import { ActivityItem } from './activity-item'
import { ACTIVITY_PAGE_SIZE, activityQuery, hasActivityFilters } from './queries'

/**
 * Activity (pattern: list page, from board AuditLog): Vento Real Estate's platform trail, newest first.
 * Read-only and append-only; no export in slice 1.
 */
export function ActivityPage() {
  useConsoleTitle('Activity')
  const search = useSearch({ from: '/console/activity' })
  const navigate = useNavigate()
  const list = useQuery(activityQuery(search))
  const data = list.data
  const update = (patch: Partial<ActivitySearch>) =>
    void navigate({
      to: '/console/activity',
      search: { ...search, ...patch, page: 'page' in patch ? patch.page : undefined },
    })
  const filtered = hasActivityFilters(search)
  const organizationName =
    data?.items.find((row) => row.organization?.id === search.organization)?.organization?.name ??
    null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Activity"
        description="Every change Vento Real Estate makes to releases, plans and organizations, with who and why."
      />
      <ActivityFilters search={search} update={update} organizationName={organizationName} />
      <div
        aria-busy={list.isFetching || undefined}
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-150',
          list.isPlaceholderData && list.isFetching && 'opacity-60',
        )}
      >
        {list.isError && !data ? (
          <ListError
            what="Activity"
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : !data ? (
          <ListSkeleton phone rows={5} />
        ) : data.items.length === 0 ? (
          filtered ? (
            <FilteredEmpty onClear={() => void navigate({ to: '/console/activity', search: {} })}>
              No changes match these filters.
            </FilteredEmpty>
          ) : (
            <ListEmpty icon={HistoryIcon}>
              No changes yet. Every change made in the console or from the command line appears
              here.
            </ListEmpty>
          )
        ) : (
          <ul
            aria-label="Changes, newest first"
            className="rounded-[10px] border bg-card px-4 sm:px-5"
          >
            {data.items.map((row) => (
              <ActivityItem key={row.id} row={row} showOrganization />
            ))}
          </ul>
        )}
        {data && (
          <TeamPagination
            page={search.page ?? 1}
            pageSize={ACTIVITY_PAGE_SIZE}
            total={data.total}
            onPage={(page) => update({ page: page > 1 ? page : undefined })}
          />
        )}
      </div>
    </div>
  )
}
