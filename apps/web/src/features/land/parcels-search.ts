import type { ListParcelsInput } from '@vento/shared'
import { oneOf, pageParam, textParam, uuidParam } from '@/lib/search-params'

/*
 * The parcels list address: `/land?filter=titled&q=lekki&sort=size&dir=desc&page=2&sheet=add`.
 * Hand-written, not zod: route search validation runs in the entry bundle, so the lists below
 * mirror the shared enums (the `satisfies` checks keep them in step).
 */

type Filter = ListParcelsInput['filter']
type Sort = ListParcelsInput['sort']

/** "All" is the bare address. Encumbered arrives with slice 2. */
export const PARCEL_FILTER_VALUES = [
  'titled',
  'in_progress',
  'archived',
] as const satisfies readonly Filter[]
export const PARCEL_SORT_VALUES = [
  'name',
  'reference',
  'size',
  'updated',
] as const satisfies readonly Sort[]

export type ParcelsFilter = (typeof PARCEL_FILTER_VALUES)[number]
export type ParcelsSort = (typeof PARCEL_SORT_VALUES)[number]

export type ParcelsSearch = {
  q?: string
  filter?: ParcelsFilter
  /** A–Z by name is the bare address. */
  sort?: Exclude<ParcelsSort, 'name'>
  dir?: 'desc'
  page?: number
  /** Add parcel, held in the address so Back closes it. */
  sheet?: 'add'
  /** The top bar's company (the shell's `?entity`, decision 0014). */
  entity?: string
}

export const PARCELS_PAGE_SIZE = 25

export function validateParcelsSearch(search: Record<string, unknown>): ParcelsSearch {
  const sort = oneOf(search.sort, PARCEL_SORT_VALUES)
  return {
    q: textParam(search.q, 100),
    filter: oneOf(search.filter, PARCEL_FILTER_VALUES),
    sort: sort === 'name' ? undefined : sort,
    dir: search.dir === 'desc' ? 'desc' : undefined,
    page: pageParam(search.page),
    sheet: search.sheet === 'add' ? 'add' : undefined,
  }
}

/** What the list request sends for an address: 25 a page, within the switcher's company. */
export function parcelsListInput(search: ParcelsSearch): ListParcelsInput {
  return {
    q: search.q,
    filter: search.filter ?? 'all',
    sort: search.sort ?? 'name',
    dir: search.dir ?? 'asc',
    page: search.page ?? 1,
    pageSize: PARCELS_PAGE_SIZE,
    entityId: uuidParam(search.entity),
  }
}

/** Any filter or search narrowing the list (the filtered-empty state, and Clear filters). */
export function isFiltered(search: ParcelsSearch): boolean {
  return Boolean(search.q || search.filter)
}

/** Clicking a sortable column: a new column starts ascending, the same one flips. */
export function nextSort(
  search: ParcelsSearch,
  column: ParcelsSort,
): Pick<ParcelsSearch, 'sort' | 'dir' | 'page'> {
  const current = search.sort ?? 'name'
  const dir = current === column && search.dir !== 'desc' ? 'desc' : undefined
  return { sort: column === 'name' ? undefined : column, dir, page: undefined }
}
