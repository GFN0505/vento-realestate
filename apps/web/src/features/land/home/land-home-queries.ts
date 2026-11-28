import { orpc } from '@/lib/orpc'

/*
 * Home's own reads beyond landHomeQuery (parcels-queries.ts): the parcels Upload document can
 * file into. One page of 100 by name is the picker; a group with more searches the list.
 */

export const UPLOAD_PARCELS_PAGE = 100

export function uploadParcelsQuery(entityId: string | undefined) {
  return orpc.land.parcels.list.queryOptions({
    input: { pageSize: UPLOAD_PARCELS_PAGE, sort: 'name', entityId },
    staleTime: 30_000,
  })
}
