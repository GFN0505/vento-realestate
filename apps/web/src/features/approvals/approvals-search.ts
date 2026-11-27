import type { ApprovalsTab, ListApprovalsInput } from '@vento/shared'
import { oneOf, pageParam, uuidParam } from '@/lib/search-params'

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

export function validateApprovalsSearch(search: Record<string, unknown>): ApprovalsSearch {
  return {
    tab: oneOf(search.tab, ['mine', 'decided'] as const),
    id: uuidParam(search.id),
    page: pageParam(search.page),
  }
}

/** What the list request sends: the tab, its page, and the company switcher (decision 0014). */
export function approvalsListInput(search: ApprovalsSearch): ListApprovalsInput {
  return {
    tab: search.tab ?? 'waiting',
    entityId: uuidParam(search.entity),
    page: search.page ?? 1,
    pageSize: APPROVALS_PAGE_SIZE,
  }
}
