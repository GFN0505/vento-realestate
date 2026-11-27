import { keepPreviousData } from '@tanstack/react-query'
import { type FeatureKey, isFeatureKey } from '@vento/shared'
import type { ListActivityInput } from '@vento/shared/console'
import type { ActivitySearch } from '@/routes/console/-search'
import { consoleOrpc } from '../api'

export const ACTIVITY_PAGE_SIZE = 25

export function activityInput(search: ActivitySearch): ListActivityInput {
  const featureKey: FeatureKey | undefined =
    search.feature && isFeatureKey(search.feature) ? search.feature : undefined
  return {
    actorUserId: search.person,
    organizationId: search.organization,
    featureKey,
    kind: search.kind,
    from: search.from,
    // A range typed backwards is ignored rather than refused.
    to: search.from && search.to && search.to < search.from ? undefined : search.to,
    page: search.page ?? 1,
    pageSize: ACTIVITY_PAGE_SIZE,
  }
}

export const activityQuery = (search: ActivitySearch) =>
  consoleOrpc.console.activity.list.queryOptions({
    input: activityInput(search),
    placeholderData: keepPreviousData,
  })

export const activityPeopleQuery = () =>
  consoleOrpc.console.activity.people.queryOptions({ staleTime: 5 * 60_000 })

export function hasActivityFilters(search: ActivitySearch): boolean {
  return Boolean(
    search.person ||
      search.organization ||
      search.feature ||
      search.kind ||
      search.from ||
      search.to,
  )
}
