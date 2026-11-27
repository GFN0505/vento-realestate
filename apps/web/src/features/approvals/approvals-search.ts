import type { ApprovalsTab, ListApprovalsInput } from '@vento/shared'

/*
 * The inbox address: `/approvals?tab=mine&id=<request id>&page=2`. Hand-written, not zod: route
 * search validation runs in the entry bundle. Waiting for me is the default tab, so it's bare.
 */

export type ApprovalsSearch = {
  tab?: Exclude<ApprovalsTab, 'waiting'>
  /** The open request: beside the list from md, its own page on phones (emails link here). */
  id?: string
  page?: number
  /** The top bar's company (the shell's `?entity`). */
  entity?: string
}

export const APPROVALS_PAGE_SIZE = 25

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateApprovalsSearch(search: Record<string, unknown>): ApprovalsSearch {
  const page = Number(search.page)
  const tab = search.tab === 'mine' || search.tab === 'decided' ? search.tab : undefined
  const id = typeof search.id === 'string' && UUID.test(search.id) ? search.id : undefined
  return {
    tab,
    id,
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : undefined,
  }
}

/** What the list request sends: the tab, its page, and the company switcher (decision 0014). */
export function approvalsListInput(search: ApprovalsSearch): ListApprovalsInput {
  return {
    tab: search.tab ?? 'waiting',
    entityId: search.entity && UUID.test(search.entity) ? search.entity : undefined,
    page: search.page ?? 1,
    pageSize: APPROVALS_PAGE_SIZE,
  }
}
