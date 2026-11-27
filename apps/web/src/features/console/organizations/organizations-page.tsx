import { useQuery } from '@tanstack/react-query'
import { Building2Icon } from 'lucide-react'
import { FilterChips } from '@/components/filter-chips'
import { PageHeader } from '@/components/page-header'
import { SearchField } from '@/components/search-field'
import { TeamPagination } from '@/features/team/team-pagination'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import type { OrganizationsSearch } from '@/routes/console/-search'
import { useConsoleTitle } from '../shell/use-console-title'
import { FilteredEmpty, ListEmpty, ListError, ListSkeleton } from '../ui/list-states'
import { plural } from '../words'
import { OrganizationStats } from './organization-stats'
import { OrganizationsCards, OrganizationsTable } from './organizations-table'
import { ORGANIZATIONS_PAGE_SIZE, organizationsQuery, summaryQuery } from './queries'
import { useOrganizationsSearch } from './use-organizations-search'

type Chip = NonNullable<OrganizationsSearch['filter']> | 'all'
const CHIPS: { value: Chip; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'trial', label: 'On trial' },
  { value: 'pilot', label: 'Pilot' },
  { value: 'internal', label: 'Internal' },
  { value: 'over_limit', label: 'Over a limit' },
]
export const ORGANIZATIONS_SEARCH_ID = 'console-organizations-search'

/** The console home (boards AdminOrgs, AdminOrgsMobile): every customer, last active first. */
export function OrganizationsPage() {
  useConsoleTitle('Organizations')
  const phone = useMediaQuery(PHONE_QUERY)
  const { search, update } = useOrganizationsSearch()
  const list = useQuery(organizationsQuery(search))
  const summary = useQuery(summaryQuery()).data
  const data = list.data
  const filtered = Boolean(search.filter || search.q)
  const clear = () => update({ filter: undefined, q: undefined })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Organizations"
        description={
          summary
            ? `${plural(summary.organizations, 'organization')} · ${plural(summary.people, 'person', 'people')}`
            : ' '
        }
      />
      <OrganizationStats filter={search.filter} onFilter={(filter) => update({ filter })} />
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <FilterChips
          label="Show"
          chips={CHIPS}
          value={search.filter ?? 'all'}
          onChange={(value) => update({ filter: value === 'all' ? undefined : value })}
          className="-mx-4 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0 [&>button]:shrink-0"
        />
        <SearchField
          id={ORGANIZATIONS_SEARCH_ID}
          value={search.q}
          onSearch={(q) => update({ q }, { replace: true })}
          label="Search by organization or owner email"
          placeholder="Organization or owner email"
          className="md:w-72"
        />
      </div>
      <div
        aria-busy={list.isFetching || undefined}
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-150',
          list.isPlaceholderData && list.isFetching && 'opacity-60',
        )}
      >
        {list.isError && !data ? (
          <ListError
            what="Organizations"
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : !data ? (
          <ListSkeleton phone={phone} />
        ) : data.items.length === 0 ? (
          filtered ? (
            <FilteredEmpty onClear={clear}>No organizations match these filters.</FilteredEmpty>
          ) : (
            <ListEmpty icon={Building2Icon}>
              No organizations yet. They appear here when someone finishes signing up.
            </ListEmpty>
          )
        ) : phone ? (
          <OrganizationsCards rows={data.items} />
        ) : (
          <OrganizationsTable rows={data.items} />
        )}
        {data && (
          <TeamPagination
            page={search.page ?? 1}
            pageSize={ORGANIZATIONS_PAGE_SIZE}
            total={data.total}
            onPage={(page) => update({ page: page > 1 ? page : undefined })}
          />
        )}
      </div>
    </div>
  )
}
