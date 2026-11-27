import type { ListEntitiesInput } from '@vento/shared'
import { pageParam, textParam } from '@/lib/search-params'

/*
 * The Companies page address: `/settings/companies?show=archived&q=parkview&page=2`.
 * Hand-written, not zod: route search validation runs in the entry bundle.
 */

export type CompaniesSearch = {
  show?: 'archived'
  q?: string
  page?: number
}

export const COMPANIES_PAGE_SIZE = 50

export function validateCompaniesSearch(search: Record<string, unknown>): CompaniesSearch {
  return {
    show: search.show === 'archived' ? 'archived' : undefined,
    q: textParam(search.q, 100),
    page: pageParam(search.page),
  }
}

/** What the list request sends for an address: A–Z by name, 50 a page. */
export function companiesListInput(search: CompaniesSearch): ListEntitiesInput {
  return {
    status: search.show ?? 'active',
    q: search.q,
    page: search.page ?? 1,
    pageSize: COMPANIES_PAGE_SIZE,
  }
}
