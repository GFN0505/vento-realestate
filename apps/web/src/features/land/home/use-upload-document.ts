import { useQuery, useQueryClient } from '@tanstack/react-query'
import { documentLabel, type TitleDocumentType } from '@vento/shared'
import { useState } from 'react'
import { invalidateParcel } from '@/features/land/parcels-queries'
import { useMe } from '@/features/preview/use-effective-permissions'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { useFileUpload } from '@/lib/upload/use-file-upload'
import { uploadParcelsQuery } from './land-home-queries'
import {
  defaultUploadParcel,
  defaultUploadType,
  type UploadDraft,
  uploadErrors,
  uploadName,
} from './upload-defaults'
import { rememberedUploadParcel, rememberUploadParcel } from './upload-memory'

export type Uploaded = { parcelId: string; parcelName: string; toast: string }

/**
 * Upload document from Home: which parcel (remembered), what it is (guessed), the file (going up
 * as soon as it's picked), then one call. A refusal keeps the file and every choice.
 */
export function useUploadDocument(entityId: string | undefined) {
  const me = useMe()
  const organizationId = me.organization?.id
  const queryClient = useQueryClient()
  const list = useQuery(uploadParcelsQuery(entityId))
  // A parcel of an archived company is read-only: nothing can be filed into it.
  const parcels = (list.data?.items ?? []).filter((p) => !p.entity.archived)
  const uploads = useFileUpload({ purpose: 'title_document' })

  const [remembered] = useState(() => rememberedUploadParcel(organizationId))
  const [chosenParcel, setParcel] = useState<string | null>(null)
  const [chosenType, setType] = useState<TitleDocumentType | '' | null>(null)
  const [name, setName] = useState('')
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const parcelId = chosenParcel ?? defaultUploadParcel(remembered, parcels)
  const parcel = parcels.find((p) => p.id === parcelId) ?? null
  const file = uploads.items.at(-1) ?? null
  const type = defaultUploadType({
    chosen: chosenType,
    fileGuess: file?.guess ?? null,
    currentStage: parcel?.currentStage?.type ?? null,
  })
  const draft: UploadDraft = { parcelId, type, name, fileId: uploads.done.at(-1)?.fileId ?? null }
  const errors = checked ? uploadErrors(draft) : {}

  async function submit(): Promise<Uploaded | null> {
    setChecked(true)
    setError(null)
    if (Object.keys(uploadErrors(draft)).length > 0 || !draft.fileId || !draft.type) return null
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return null
    }
    setPending(true)
    try {
      const docName = uploadName(draft)
      const saved = await client.land.documents.upload({
        parcelId,
        type: draft.type,
        name: docName,
        fileId: draft.fileId,
      })
      rememberUploadParcel(organizationId, parcelId)
      invalidateParcel(queryClient, parcelId)
      return {
        parcelId,
        parcelName: parcel?.name ?? '',
        toast: `${documentLabel(saved.document.type, saved.document.name)} v${saved.version.versionNo} uploaded`,
      }
    } catch (caught) {
      setError(caught)
      return null
    } finally {
      setPending(false)
    }
  }

  return {
    list,
    parcels,
    parcel,
    uploads,
    draft,
    errors,
    pending,
    error,
    /** Something here would be lost by closing. */
    dirty: uploads.items.length > 0 || chosenParcel !== null || chosenType !== null || name !== '',
    setParcel,
    setType,
    setName,
    submit,
  }
}

export type UploadDocument = ReturnType<typeof useUploadDocument>
