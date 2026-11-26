import { keepPreviousData } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import { type TeamSearch, teamListInput } from './team-search'

/** One page of the team. Kept in the entry with the route's loader, so no zod and no copy here. */
export function teamListQuery(search: TeamSearch) {
  return orpc.team.list.queryOptions({
    input: teamListInput(search),
    staleTime: 30_000,
    // Paging and filtering keep the old rows on screen until the new ones arrive (no flash).
    placeholderData: keepPreviousData,
  })
}

/** Every page and filter of the list, for invalidation after a change. */
export function teamListKey() {
  return orpc.team.list.key()
}
