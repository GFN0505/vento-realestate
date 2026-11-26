import { keepPreviousData } from '@tanstack/react-query'
import type { ListOrganizationsInput } from '@vento/shared/console'
import type { OrganizationsSearch } from '@/routes/console/-search'
import { consoleOrpc } from '../api'

export const ORGANIZATIONS_PAGE_SIZE = 25
export const ENDED_PAGE_SIZE = 10
export const ORGANIZATION_ACTIVITY_SIZE = 8

export function organizationsInput(search: OrganizationsSearch): ListOrganizationsInput {
  return {
    filter: search.filter ?? 'all',
    search: search.q,
    page: search.page ?? 1,
    pageSize: ORGANIZATIONS_PAGE_SIZE,
  }
}

export function organizationsQuery(search: OrganizationsSearch) {
  return consoleOrpc.console.organizations.list.queryOptions({
    input: organizationsInput(search),
    placeholderData: keepPreviousData,
  })
}

export const summaryQuery = () => consoleOrpc.console.organizations.summary.queryOptions()

export const organizationQuery = (id: string) =>
  consoleOrpc.console.organizations.get.queryOptions({ input: { id } })

export const featuresQuery = (id: string) =>
  consoleOrpc.console.organizations.features.queryOptions({ input: { id } })

export const endedOverridesQuery = (id: string, page: number) =>
  consoleOrpc.console.organizations.endedOverrides.queryOptions({
    input: { id, page, pageSize: ENDED_PAGE_SIZE },
    placeholderData: keepPreviousData,
  })

export const organizationActivityQuery = (organizationId: string) =>
  consoleOrpc.console.activity.list.queryOptions({
    input: { organizationId, page: 1, pageSize: ORGANIZATION_ACTIVITY_SIZE },
  })
