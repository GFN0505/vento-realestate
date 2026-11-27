import { useQuery } from '@tanstack/react-query'
import type { FeatureWhy } from '@vento/shared/console'
import { FilterChips } from '@/components/filter-chips'
import { SearchField } from '@/components/search-field'
import { Skeleton } from '@/components/ui/skeleton'
import { CardNote, DetailCard } from '../ui/detail-card'
import { groupOf } from '../words'
import { FeatureGroups } from './feature-groups'
import { featuresQuery } from './queries'
import { useOrganizationSearch } from './use-organization-search'

type Show = 'all' | 'available' | 'unavailable'
const CHIPS: { value: Show; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Not available' },
]

/** Groups rows by catalog module (AI add-on features apart), in the server's catalog order. */
export function groupByModule(
  rows: readonly FeatureWhy[],
): { module: string; rows: FeatureWhy[] }[] {
  const groups = new Map<string, FeatureWhy[]>()
  for (const row of rows) {
    const group = groupOf(row.key, row.module)
    groups.set(group, [...(groups.get(group) ?? []), row])
  }
  return [...groups].map(([module, items]) => ({ module, rows: items }))
}

/**
 * The "why" (spec): every feature, Available or Not available, and the one reason the
 * availability rule gives, in its order. A name box and the chips narrow the list; each row
 * offers an override.
 */
export function FeaturesCard({ organizationId }: { organizationId: string }) {
  const { search, update } = useOrganizationSearch()
  const features = useQuery(featuresQuery(organizationId))
  const show: Show = search.show ?? 'all'
  const find = search.find?.toLowerCase()
  const rows = (features.data ?? []).filter(
    (f) =>
      (show === 'all' || f.available === (show === 'available')) &&
      (!find || f.label.toLowerCase().includes(find) || f.key.includes(find)),
  )
  const filtered = show !== 'all' || Boolean(find)
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
      <SearchField
        id="console-feature-find"
        value={search.find}
        onSearch={(text) => update({ find: text }, { replace: true })}
        label="Find a feature"
        placeholder="Find a feature"
        className="pt-1 pb-2 sm:max-w-72"
      />
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
          {filtered
            ? 'No features match. Clear the name or choose All.'
            : 'There are no features in the catalog.'}
        </CardNote>
      ) : (
        <FeatureGroups groups={groupByModule(rows)} all={features.data} />
      )}
    </DetailCard>
  )
}
