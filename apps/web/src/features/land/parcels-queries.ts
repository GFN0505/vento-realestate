import { keepPreviousData, type QueryClient } from '@tanstack/react-query'
import type { ParcelDetail } from '@vento/shared'
import { orpc } from '@/lib/orpc'
import { type ParcelsSearch, parcelsListInput } from './parcels-search'

/*
 * Land & title queries, shared by the list, the detail page, the sheets, ⌘K and Home. In the
 * entry with the routes' loaders: no zod and no copy here.
 */

/** A repeat visit shows cached rows at once (spec: under 1 s on slow 3G), then refreshes. */
const LIST_STALE_MS = 30_000

/** One page of parcels for an address. */
export function parcelsListQuery(search: ParcelsSearch) {
  return orpc.land.parcels.list.queryOptions({
    input: parcelsListInput(search),
    staleTime: LIST_STALE_MS,
    // One quiet retry, then "Parcels couldn't load" with Try again: a weak network shouldn't
    // wait through the default three.
    retry: 1,
    // A chip, a sort or a search keeps the old rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  })
}

/** ⌘K's Parcels group: the server's name and reference search, five at a time. */
export function parcelSearchQuery(q: string, entityId: string | undefined) {
  return orpc.land.parcels.list.queryOptions({
    input: { q, pageSize: 5, entityId },
    staleTime: LIST_STALE_MS,
    placeholderData: keepPreviousData,
  })
}

export function parcelQuery(id: string) {
  return orpc.land.parcels.get.queryOptions({ input: { id }, staleTime: LIST_STALE_MS, retry: 1 })
}

/** The duplicate-name hint on Add / Edit parcel. */
export function parcelNameTakenQuery(name: string, excludeId?: string) {
  return orpc.land.parcels.nameTaken.queryOptions({
    input: { name, excludeId },
    staleTime: LIST_STALE_MS,
  })
}

export const ACTIVITY_PAGE_SIZE = 25

/** A parcel's activity, newest first. */
export function parcelActivityQuery(id: string, page = 1) {
  return orpc.land.parcels.activity.queryOptions({
    input: { id, page, pageSize: ACTIVITY_PAGE_SIZE },
    staleTime: LIST_STALE_MS,
    placeholderData: keepPreviousData,
  })
}

/** Every version of one vault document, removed ones included. */
export function documentVersionsQuery(documentId: string) {
  return orpc.land.documents.versions.queryOptions({
    input: { documentId },
    staleTime: LIST_STALE_MS,
  })
}

/** The Land & legal home: tile, pipeline and queue, within the switcher's company. */
export function landHomeQuery(entityId: string | undefined) {
  return orpc.land.home.queryOptions({ input: { entityId }, staleTime: LIST_STALE_MS })
}

/** Everything that lists parcels or counts them: the list, ⌘K, the name hint and Home. */
export function invalidateParcelLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpc.land.parcels.list.key() })
  void queryClient.invalidateQueries({ queryKey: orpc.land.parcels.nameTaken.key() })
  void queryClient.invalidateQueries({ queryKey: orpc.land.home.key() })
}

/**
 * After any write that answers with the parcel (add, edit, stage update, upload…): the detail
 * shows the answer at once, lists and Home refresh, and the activity picks up the new event.
 */
export function refreshParcel(queryClient: QueryClient, parcel: ParcelDetail): void {
  queryClient.setQueryData(parcelQuery(parcel.id).queryKey, parcel)
  invalidateParcelLists(queryClient)
  void queryClient.invalidateQueries({
    queryKey: orpc.land.parcels.activity.key({ input: { id: parcel.id } }),
  })
  // A stage update can file a new version of a document whose earlier ones are open.
  void queryClient.invalidateQueries({ queryKey: orpc.land.documents.versions.key() })
}

/** After a write that doesn't answer with the parcel (archive, restore, a version removed). */
export function invalidateParcel(queryClient: QueryClient, id: string): void {
  void queryClient.invalidateQueries({ queryKey: parcelQuery(id).queryKey })
  void queryClient.invalidateQueries({
    queryKey: orpc.land.parcels.activity.key({ input: { id } }),
  })
  void queryClient.invalidateQueries({ queryKey: orpc.land.documents.versions.key() })
  invalidateParcelLists(queryClient)
}

let visited = false

/** True once per page load: the first visit waits for its rows, later ones keep the old rows. */
export function firstParcelsVisit(): boolean {
  if (visited) return false
  visited = true
  return true
}
