import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { ReleaseRow } from '@vento/shared/console'
import { ChevronRightIcon, FlagIcon } from 'lucide-react'
import { FormAlert } from '@/components/auth/form-alert'
import { FilterChips } from '@/components/filter-chips'
import { PageHeader } from '@/components/page-header'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import type { ReleasesSearch } from '@/routes/console/-search'
import { useConsoleTitle } from '../shell/use-console-title'
import { cardRow, nameLink, td, th } from '../ui/back-link'
import { FilteredEmpty, ListEmpty, ListError, ListSkeleton } from '../ui/list-states'
import { count, groupOf, moduleLabel, plural } from '../words'
import { releasesQuery } from './queries'
import { PlansText, StageBadge } from './release-cells'

type Chip = NonNullable<ReleasesSearch['filter']> | 'all'
const CHIPS: { value: Chip; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'off', label: 'Off' },
  { value: 'internal', label: 'Internal' },
  { value: 'pilot', label: 'Pilot' },
  { value: 'on', label: 'On' },
  { value: 'in_no_plan', label: 'In no plan' },
]

/** Releases (pattern: list page): every catalog feature, its stage, who has it, which plans. */
export function ReleasesPage() {
  useConsoleTitle('Releases')
  const phone = useMediaQuery(PHONE_QUERY)
  const search = useSearch({ from: '/console/releases/' })
  const navigate = useNavigate()
  const list = useQuery(releasesQuery(search.filter))
  const data = list.data
  const setFilter = (value: Chip) =>
    void navigate({ to: '/console/releases', search: value === 'all' ? {} : { filter: value } })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Releases"
        description={data ? plural(data.items.length, 'feature') : ' '}
      />
      {data && data.staleKeys.length > 0 && (
        <FormAlert variant="info">
          {plural(data.staleKeys.length, 'key')} in data{' '}
          {data.staleKeys.length === 1 ? 'is' : 'are'} no longer in the code and{' '}
          {data.staleKeys.length === 1 ? 'is' : 'are'} ignored: {data.staleKeys.join(', ')}.
        </FormAlert>
      )}
      <FilterChips
        label="Stage"
        chips={CHIPS}
        value={search.filter ?? 'all'}
        onChange={setFilter}
        className="-mx-4 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0 [&>button]:shrink-0"
      />
      {list.isError && !data ? (
        <ListError what="Releases" onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : !data ? (
        <ListSkeleton phone={phone} rows={8} />
      ) : data.items.length === 0 ? (
        search.filter ? (
          <FilteredEmpty onClear={() => setFilter('all')}>
            No features match this filter.
          </FilteredEmpty>
        ) : (
          <ListEmpty icon={FlagIcon}>No features in the catalog.</ListEmpty>
        )
      ) : phone ? (
        <ReleasesCards rows={data.items} />
      ) : (
        <ReleasesTable rows={data.items} />
      )}
    </div>
  )
}

function ReleasesTable({ rows }: { rows: readonly ReleaseRow[] }) {
  const navigate = useNavigate()
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Features and their release stage</caption>
        <colgroup>
          <col className="w-[34%]" />
          <col className="hidden @3xl:table-column @3xl:w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[16%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              Feature
            </th>
            <th scope="col" className={`${th} hidden @3xl:table-cell`}>
              Module
            </th>
            <th scope="col" className={th}>
              Stage
            </th>
            <th scope="col" className={`${th} text-right`}>
              Organizations
            </th>
            <th scope="col" className={th}>
              Plans
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={row.key}
              data-testid="release-row"
              onClick={(event) => {
                if ((event.target as Element).closest('a')) return
                void navigate({ to: '/console/releases/$key', params: { key: row.key } })
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className={td}>
                <div className="flex min-w-0 flex-col">
                  <Link to="/console/releases/$key" params={{ key: row.key }} className={nameLink}>
                    {row.label}
                  </Link>
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    {row.key}
                  </span>
                </div>
              </td>
              <td className={`${td} hidden text-muted-foreground @3xl:table-cell`}>
                {moduleLabel(groupOf(row.key, row.module))}
              </td>
              <td className={td}>
                <StageBadge stage={row.stage} />
              </td>
              <td className={`${td} text-right tabular-nums`}>{count(row.organizations)}</td>
              <td className={`${td} truncate`}>
                <PlansText row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReleasesCards({ rows }: { rows: readonly ReleaseRow[] }) {
  return (
    <ul aria-label="Features" className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.key}>
          <Link to="/console/releases/$key" params={{ key: row.key }} className={cardRow}>
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-semibold text-[14px]">{row.label}</span>
              <span className="flex items-center gap-1.5">
                <StageBadge stage={row.stage} />
                <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
              </span>
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {plural(row.organizations, 'organization')} · <PlansText row={row} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
