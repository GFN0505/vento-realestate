import { FilterChips } from '@/components/filter-chips'
import { SearchField } from '@/components/search-field'
import { LAND_COPY, PARCEL_FILTER_CHIPS } from './land-words'
import type { ParcelsSearch } from './parcels-search'

type Props = {
  search: ParcelsSearch
  update: (patch: Partial<ParcelsSearch>, options?: { replace?: boolean }) => void
}

/**
 * Search (name, area, LGA or reference) and the All · Titled · In progress · Archived chips, both
 * in the address. Phones: the chips scroll sideways in one row, 44px tall.
 */
export function ParcelsToolbar({ search, update }: Props) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <SearchField
        id="parcels-search"
        value={search.q}
        onSearch={(q) => update({ q, page: undefined }, { replace: true })}
        label={LAND_COPY.search}
        placeholder={LAND_COPY.search}
        className="md:w-72"
      />
      <FilterChips
        label="Show"
        chips={PARCEL_FILTER_CHIPS}
        value={search.filter ?? 'all'}
        onChange={(filter) =>
          update({ filter: filter === 'all' ? undefined : filter, page: undefined })
        }
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:px-0 [&>button]:shrink-0"
      />
    </div>
  )
}
