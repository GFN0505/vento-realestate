import {
  type ParcelDetail,
  TITLE_DOCUMENTS,
  type TitleDocument,
  type TitleDocumentType,
  type UploadDocumentInput,
  uploadDocumentInput,
} from '@vento/shared'
import type { FieldErrors, Resolver } from 'react-hook-form'
import { todayInLagos } from '@/lib/format'

/*
 * Upload document from the parcel page (`?sheet=upload`, or `&doc=<id>` for a new version of a
 * row). Strings while typing; the shared schema checks the request it becomes.
 */

export type UploadFormValues = {
  type: TitleDocumentType | ''
  name: string
  /** **Add as a separate document** (several receipts, agreements or deeds). */
  separate: boolean
  number: string
  issuedOn: string
  issuedBy: string
  note: string
}

/** From a row's "Upload new version", else the current stage's document if it has none yet. */
export function uploadDefaults(
  parcel: ParcelDetail,
  doc: TitleDocument | undefined,
): UploadFormValues {
  const current = parcel.currentStage?.type
  const type: TitleDocumentType | '' =
    doc?.type ?? (current && !parcel.documents.some((d) => d.type === current) ? current : '')
  const stageType = type ? TITLE_DOCUMENTS[type].stageType : null
  return {
    type,
    name: doc?.name ?? '',
    separate: false,
    number: '',
    issuedOn: '',
    issuedBy: stageType ? (parcel.suggestedIssuers[stageType] ?? '') : '',
    note: '',
  }
}

/** The vault document this upload becomes a version of (same type, same name in any case). */
export function versionTarget(
  parcel: ParcelDetail,
  values: Pick<UploadFormValues, 'type' | 'name' | 'separate'>,
): TitleDocument | undefined {
  if (!values.type || values.separate) return undefined
  const name = values.name.trim().toLowerCase()
  return parcel.documents.find(
    (d) => d.type === values.type && (d.name ?? '').toLowerCase() === name && d.latest,
  )
}

/** The request for these values and a finished file. */
export function uploadInput(
  parcelId: string,
  fileId: string,
  values: UploadFormValues,
): UploadDocumentInput {
  const type = values.type || 'other'
  const def = TITLE_DOCUMENTS[type]
  return {
    parcelId,
    fileId,
    type,
    name: def.multiple ? values.name : null,
    separate: def.multiple && values.separate,
    number: def.stageType ? values.number : null,
    issuedOn: def.stageType && values.issuedOn ? values.issuedOn : null,
    issuedBy: def.stageType ? values.issuedBy : null,
    note: values.note,
  }
}

const FIELDS = ['type', 'name', 'number', 'issuedOn', 'issuedBy', 'note'] as const
type Field = (typeof FIELDS)[number]
const isField = (key: unknown): key is Field => FIELDS.some((f) => f === key)

// Any well-formed ids: the checks below don't depend on which parcel or file.
const SAMPLE_ID = '00000000-0000-7000-8000-000000000000'

export const uploadResolver: Resolver<UploadFormValues> = (values) => {
  const errors: FieldErrors<UploadFormValues> = {}
  const put = (field: Field, message: string) => {
    errors[field] ??= { type: 'validate', message }
  }
  if (!values.type) put('type', 'Choose what this document is')
  if (values.issuedOn && values.issuedOn > todayInLagos()) {
    put('issuedOn', 'Enter a date on or before today.')
  }
  if (values.type) {
    const parsed = uploadDocumentInput.safeParse(uploadInput(SAMPLE_ID, SAMPLE_ID, values))
    for (const issue of parsed.error?.issues ?? []) {
      const [field] = issue.path
      put(isField(field) ? field : 'name', issue.message)
    }
  }
  return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} }
}
