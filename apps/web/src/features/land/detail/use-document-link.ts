import { ORPCError } from '@orpc/client'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage, isHandledElsewhere } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { invalidateParcel } from '../parcels-queries'
import { DETAIL_COPY } from './detail-words'

type Disposition = 'inline' | 'attachment'

/**
 * Words for a link that wasn't issued: too many opened in a short time (429), a version
 * removed meanwhile (NOT_FOUND), offline, or anything else said calmly.
 */
export function linkErrorText(error: unknown): string {
  if (!connection.isOnline()) return DETAIL_COPY.offlineLink
  if (error instanceof ORPCError) {
    if (error.code === 'TOO_MANY_REQUESTS' || error.status === 429) return DETAIL_COPY.tooManyLinks
    if (error.code === 'NOT_FOUND') return DETAIL_COPY.versionGone
  }
  return error instanceof ORPCError ? apiErrorMessage(error) : DETAIL_COPY.linkError
}

/** A fresh 5-minute link each time (decision 0025): never cached, never kept in the page. */
export function fetchDocumentLink(versionId: string, disposition: Disposition) {
  return client.land.documents.link({ versionId, disposition })
}

/**
 * Download and open-in-a-tab for vault rows. Download hands the browser a link the storage
 * serves as an attachment, so the page stays put. A new tab (phones' preview) is opened before
 * the request, because browsers block tabs opened after an await.
 */
export function useDocumentLink(parcelId: string) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  function fail(error: unknown) {
    if (isHandledElsewhere(error)) return
    // A removed version: the vault refreshes so the row shows what's there now.
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') {
      invalidateParcel(queryClient, parcelId)
    }
    toast.error(linkErrorText(error))
  }

  async function run(versionId: string, disposition: Disposition, tab: Window | null) {
    if (!connection.isOnline()) {
      tab?.close()
      toast.error(linkErrorText(null))
      return
    }
    setBusy(`${versionId}:${disposition}`)
    try {
      const { url } = await fetchDocumentLink(versionId, disposition)
      if (tab) tab.location.replace(url)
      else window.location.assign(url)
    } catch (error) {
      tab?.close()
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  return {
    /** "versionId:attachment" while that link is being fetched. */
    busy,
    download: (versionId: string) => run(versionId, 'attachment', null),
    openInTab: (versionId: string) => {
      const tab = window.open('', '_blank')
      // The storage page must not reach back into this one.
      if (tab) tab.opener = null
      return run(versionId, 'inline', tab)
    },
  }
}
