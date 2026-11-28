import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import type { DocumentVersion, ParcelDetail } from '@vento/shared'
import { formatDate } from '@/lib/format'
import { documentVersionsQuery } from '../parcels-queries'
import { versionName } from './detail-words'
import type { PreviewVersion } from './document-preview'

/** The version in `?preview=`: a row's latest, or one from a history already opened. */
function findVersion(queryClient: QueryClient, parcel: ParcelDetail, versionId: string) {
  for (const doc of parcel.documents) {
    if (doc.latest?.id === versionId) return { doc, version: doc.latest }
    const history = queryClient.getQueryData<DocumentVersion[]>(
      documentVersionsQuery(doc.id).queryKey,
    )
    const version = history?.find((v) => v.id === versionId)
    if (version) return { doc, version }
  }
  return null
}

/** What the preview dialog shows for `?preview=`; a link to an unknown version still opens. */
export function usePreviewVersion(
  parcel: ParcelDetail | undefined,
  versionId: string | undefined,
): PreviewVersion | null {
  const queryClient = useQueryClient()
  if (!parcel || !versionId) return null
  const found = findVersion(queryClient, parcel, versionId)
  if (!found) return { id: versionId, label: 'Document', meta: null, contentType: null }
  const { doc, version } = found
  return {
    id: version.id,
    label: versionName(doc, version.versionNo),
    meta: `Uploaded ${formatDate(version.uploadedAt)} by ${version.uploadedBy.name}`,
    contentType: version.file.contentType,
  }
}
