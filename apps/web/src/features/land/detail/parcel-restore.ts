import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { invalidateParcel } from '../parcels-queries'
import { DETAIL_COPY, UNDO_MS } from './detail-words'

/** Restore, from the header or an Undo toast. */
export async function restoreParcel(queryClient: QueryClient, parcelId: string): Promise<boolean> {
  if (!connection.isOnline()) {
    toast.error(OFFLINE_SAVE_ERROR)
    return false
  }
  try {
    await client.land.parcels.restore({ id: parcelId })
    invalidateParcel(queryClient, parcelId)
    toast.success(DETAIL_COPY.restored)
    return true
  } catch (error) {
    toastApiError(error)
    return false
  }
}

/**
 * Archive parcel: reversible, so it runs at once (undo over confirm) with "Parcel archived ·
 * Undo" for 8 s; Restore parcel stays on the page afterwards.
 */
export async function archiveParcel(queryClient: QueryClient, parcelId: string): Promise<boolean> {
  if (!connection.isOnline()) {
    toast.error(OFFLINE_SAVE_ERROR)
    return false
  }
  try {
    await client.land.parcels.archive({ id: parcelId })
    invalidateParcel(queryClient, parcelId)
    toast.success(DETAIL_COPY.archived, {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => void restoreParcel(queryClient, parcelId) },
    })
    return true
  } catch (error) {
    toastApiError(error)
    return false
  }
}
