import { keepPreviousData } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import { type CompaniesSearch, companiesListInput } from './companies-search'

/** One page of companies. In the entry with the route's loader: no zod and no copy here. */
export function companiesListQuery(search: CompaniesSearch) {
  return orpc.entities.list.queryOptions({
    input: companiesListInput(search),
    staleTime: 30_000,
    // A chip or a search keeps the old rows on screen until the new ones arrive (no flash).
    placeholderData: keepPreviousData,
  })
}

/** Every company list (this page, the switcher), for invalidation after a change. */
export function companiesKey() {
  return orpc.entities.key()
}

let visited = false

/** True once per page load: the first visit waits for its rows, later ones keep the old rows. */
export function firstCompaniesVisit(): boolean {
  if (visited) return false
  visited = true
  return true
}
