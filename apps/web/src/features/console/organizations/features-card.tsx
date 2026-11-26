import { useQuery } from '@tanstack/react-query'
import type { FeatureWhy } from '@vento/shared/console'
import { EllipsisIcon } from 'lucide-react'
import { FilterChips } from '@/components/filter-chips'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { CardNote, DetailCard } from '../ui/detail-card'
import { moduleLabel } from '../words'
import { featuresQuery } from './queries'
import { useOrganizationSearch } from './use-organization-search'

type Show = 'all' | 'available' | 'unavailable'
const CHIPS: { value: Show; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Not available' },
]

/** Groups rows by the catalog module, in catalog order (the server's order). */
export function groupByModule(
  rows: readonly FeatureWhy[],
): { module: string; rows: FeatureWhy[] }[] {
  const groups = new Map<string, FeatureWhy[]>()
  for (const row of rows) groups.set(row.module, [...(groups.get(row.module) ?? []), row])
  return [...groups].map(([module, items]) => ({ module, rows: items }))
}

/**
 * The "why" (spec): every feature, Available or Not available, and the one reason the
 * availability rule gives, in its order. Each row offers a release or plan override.
 */
export function FeaturesCard({ organizationId }: { organizationId: string }) {
  const { search, update, openChange } = useOrganizationSearch()
  const features = useQuery(featuresQuery(organizationId))
  const show: Show = search.show ?? 'all'
  const rows = (features.data ?? []).filter(
    (f) => show === 'all' || f.available === (show === 'available'),
  )
  return (
    <DetailCard
      title="Features"
      actions={
        <FilterChips
          label="Show features"
          chips={CHIPS}
          value={show}
          onChange={(value) =>
            update({ show: value === 'all' ? undefined : value }, { replace: true })
          }
        />
      }
    >
      {!features.data ? (
        features.isError ? (
          <CardNote>Features couldn't load. Check your connection and reload the page.</CardNote>
        ) : (
          <div aria-hidden className="flex flex-col gap-3 py-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <CardNote>
          {show === 'available' ? 'Nothing is available yet.' : 'Every feature is available.'}
        </CardNote>
      ) : (
        groupByModule(rows).map((group) => (
          <section key={group.module} aria-label={moduleLabel(group.module)} className="pt-2 pb-1">
            <h3 className="pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
              {moduleLabel(group.module)}
            </h3>
            <ul>
              {group.rows.map((row) => (
                <li
                  key={row.key}
                  data-testid="feature-why"
                  className="flex items-start gap-3 border-t py-2 first:border-t-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[13px]">{row.label}</span>
                      <StatusBadge tone={row.available ? 'emerald' : 'slate'}>
                        {row.available ? 'Available' : 'Not available'}
                      </StatusBadge>
                    </span>
                    <span className="text-[13px] text-muted-foreground">{row.reason}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Overrides for ${row.label}`}
                        className="size-8 max-md:size-11"
                      >
                        <EllipsisIcon aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => openChange('override', { kind: 'release', key: row.key })}
                      >
                        Release override
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => openChange('override', { kind: 'feature', key: row.key })}
                      >
                        Plan override
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </DetailCard>
  )
}
