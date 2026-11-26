import { useQuery } from '@tanstack/react-query'
import type { ConsoleOverride, OrganizationDetail } from '@vento/shared/console'
import { EllipsisIcon } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TeamPagination } from '@/features/team/team-pagination'
import { formatDate } from '@/lib/format'
import { CardNote, DetailCard } from '../ui/detail-card'
import { overrideBy, overrideKind, overrideUntil, overrideWhat } from './override-words'
import { ENDED_PAGE_SIZE, endedOverridesQuery } from './queries'
import { useOrganizationSearch } from './use-organization-search'

/** Live overrides, one per row, with ⋯ **Clear**; the ended ones fold under "3 ended". */
export function OverridesCard({ org }: { org: OrganizationDetail }) {
  const { search, update, openChange } = useOrganizationSearch()
  const endedOpen = search.ended !== undefined
  return (
    <DetailCard
      title="Overrides"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => openChange('override')}
          className="max-md:h-11"
        >
          Add override
        </Button>
      }
    >
      {org.overrides.length === 0 ? (
        <CardNote>
          No overrides. This organization gets exactly what its plan and release group give it.
        </CardNote>
      ) : (
        <ul>
          {org.overrides.map((o) => (
            <OverrideRow
              key={o.id}
              override={o}
              onClear={() => openChange('clear-override', { kind: o.kind, key: o.key })}
            />
          ))}
        </ul>
      )}
      {org.endedOverrideCount > 0 && (
        <div className="border-t pt-2 pb-1">
          <button
            type="button"
            aria-expanded={endedOpen}
            onClick={() => update({ ended: endedOpen ? undefined : 1 }, { replace: true })}
            className="min-h-8 rounded-sm font-semibold text-link text-xs outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
          >
            {endedOpen ? 'Hide ended' : `${org.endedOverrideCount} ended`}
          </button>
          {endedOpen && (
            <EndedOverrides
              organizationId={org.id}
              page={search.ended ?? 1}
              onPage={(ended) => update({ ended }, { replace: true })}
            />
          )}
        </div>
      )}
    </DetailCard>
  )
}

function OverrideRow({
  override: o,
  onClear,
}: {
  override: ConsoleOverride
  onClear?: () => void
}) {
  return (
    <li className="flex items-start gap-3 border-t py-2.5 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[13px]">{overrideWhat(o)}</span>
          <StatusBadge tone={o.kind === 'release' ? 'blue' : 'slate'}>
            {overrideKind(o)}
          </StatusBadge>
          {o.fromTrial && <StatusBadge tone="blue">From trial</StatusBadge>}
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {overrideUntil(o)} · {overrideBy(o)}
        </p>
        <p className="text-[13px] text-muted-foreground">“{o.reason}”</p>
      </div>
      {onClear && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${overrideWhat(o)}`}
              className="size-8 max-md:size-11"
            >
              <EllipsisIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onClear}>Clear</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

function EndedOverrides({
  organizationId,
  page,
  onPage,
}: {
  organizationId: string
  page: number
  onPage: (page: number) => void
}) {
  const ended = useQuery(endedOverridesQuery(organizationId, page))
  if (!ended.data) {
    return (
      <p className="py-2 text-muted-foreground text-xs">
        {ended.isError ? "Ended overrides couldn't load." : 'Loading…'}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 opacity-90">
      <ul>
        {ended.data.items.map((o) => (
          <li key={o.id} className="border-t py-2 text-[13px] first:border-t-0">
            <span className="font-medium">{overrideWhat(o)}</span>
            <span className="text-muted-foreground">
              {' '}
              · ended {formatDate(o.endedAt)} · “{o.reason}”
            </span>
          </li>
        ))}
      </ul>
      <TeamPagination
        page={page}
        pageSize={ENDED_PAGE_SIZE}
        total={ended.data.total}
        onPage={onPage}
      />
    </div>
  )
}
