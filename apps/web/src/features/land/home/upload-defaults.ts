import {
  documentTypeForStage,
  TITLE_DOCUMENT_TYPES,
  TITLE_DOCUMENTS,
  type TitleDocumentType,
  type TitleStageType,
} from '@vento/shared'

/*
 * Upload document's smart defaults and checks (spec: done in 3 taps for a remembered parcel).
 * The parcel is the one last used; the type is what the person picked, else what the file's
 * name says, else the document of the parcel's current stage (a camera photo has no useful name).
 */

/** The parcel the picker starts on: the remembered one if it's still here, or the only one. */
export function defaultUploadParcel(
  remembered: string | null,
  parcels: readonly { id: string }[],
): string {
  if (remembered && parcels.some((p) => p.id === remembered)) return remembered
  return parcels.length === 1 ? (parcels[0]?.id ?? '') : ''
}

export const asDocumentType = (value: string | null | undefined): TitleDocumentType | '' =>
  TITLE_DOCUMENT_TYPES.find((t) => t === value) ?? ''

export function defaultUploadType(input: {
  chosen: TitleDocumentType | '' | null
  fileGuess: string | null
  currentStage: TitleStageType | null
}): TitleDocumentType | '' {
  if (input.chosen !== null) return input.chosen
  const guessed = asDocumentType(input.fileGuess)
  if (guessed) return guessed
  return input.currentStage ? documentTypeForStage(input.currentStage) : ''
}

export type UploadDraft = {
  parcelId: string
  type: TitleDocumentType | ''
  name: string
  fileId: string | null
}

export type UploadErrors = Partial<Record<'parcelId' | 'type' | 'name' | 'file', string>>

const NAME_MAX = 80

/** What Upload needs before it can send, said on each field. */
export function uploadErrors(draft: UploadDraft): UploadErrors {
  const errors: UploadErrors = {}
  if (!draft.parcelId) errors.parcelId = 'Choose the parcel this document is for'
  if (!draft.type) errors.type = 'Choose what this document is'
  const name = draft.name.trim()
  if (draft.type === 'other' && !name) errors.name = 'Name this document, e.g. Query letter'
  if (name.length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer for the name`
  if (!draft.fileId) errors.file = 'Take a photo or choose a file'
  return errors
}

/** The name goes only with types that take one (receipts, agreements, deeds, other). */
export function uploadName(draft: UploadDraft): string | null {
  if (!draft.type || !TITLE_DOCUMENTS[draft.type].multiple) return null
  return draft.name.trim() || null
}
