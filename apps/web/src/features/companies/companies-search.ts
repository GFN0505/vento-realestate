import type { ListEntitiesInput } from '@vento/shared'

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
  const page = Number(search.page)
  const q = typeof search.q === 'string' ? search.q.trim() : ''
  return {
    show: search.show === 'archived' ? 'archived' : undefined,
    q: q.length > 0 && q.length <= 100 ? q : undefined,
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : undefined,
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
