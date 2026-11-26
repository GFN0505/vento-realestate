import { FilterChips } from '@/components/filter-chips'
import { SearchField } from '@/components/search-field'
import type { CompaniesSearch } from './companies-search'

type Props = {
  search: CompaniesSearch
  update: (patch: Partial<CompaniesSearch>, options?: { replace?: boolean }) => void
}

const CHIPS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const

/** Search (name or RC number) and the Active · Archived chips, both held in the address. */
export function CompaniesToolbar({ search, update }: Props) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <SearchField
        id="companies-search"
        value={search.q}
        onSearch={(q) => update({ q, page: undefined }, { replace: true })}
        label="Search by name or RC number"
        placeholder="Search by name or RC number"
        className="md:w-72"
      />
      <FilterChips
        label="Show"
        chips={CHIPS}
        value={search.show ?? 'active'}
        onChange={(show) =>
          update({ show: show === 'archived' ? 'archived' : undefined, page: undefined })
        }
        className="grid grid-cols-2 md:ml-auto md:flex"
      />
    </div>
  )
}
