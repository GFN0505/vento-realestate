import {
  type NewDocumentInput,
  newDocumentInput,
  TITLE_DOCUMENT_TYPES,
  TITLE_DOCUMENTS,
  type TitleDocumentType,
} from '@vento/shared'
import { useCallback, useState } from 'react'
import { todayInLagos } from '@/lib/format'
import type { UploadItem } from '@/lib/upload/upload-item'
import { useFileUpload } from '@/lib/upload/use-file-upload'

/*
 * Documents dropped into Add parcel (spec step 3): each starts uploading on drop, and carries
 * what the person says it is: its type (guessed from the name), a name where the type needs one,
 * and, for a stage's document, its number and issue date (the stage is granted with them).
 */

export type DocumentDraft = {
  type: TitleDocumentType | ''
  name: string
  number: string
  issuedOn: string
}

export type DraftErrors = Partial<Record<keyof DocumentDraft, string>>

const EMPTY: DocumentDraft = { type: '', name: '', number: '', issuedOn: '' }

const asType = (guess: string | null): TitleDocumentType | '' =>
  TITLE_DOCUMENT_TYPES.find((t) => t === guess) ?? ''

/** The request's entry for an upload: only the fields its type takes. */
function candidate(fileId: string, draft: DocumentDraft, type: TitleDocumentType) {
  const def = TITLE_DOCUMENTS[type]
  return {
    fileId,
    type,
    name: def.multiple ? draft.name : null,
    number: def.stageType ? draft.number : null,
    issuedOn: def.stageType && draft.issuedOn ? draft.issuedOn : null,
    issuedBy: null,
  }
}

// Any well-formed id: the row's own checks don't depend on which file it is.
const SAMPLE_FILE_ID = '00000000-0000-7000-8000-000000000000'

/** What one row needs before Save: the shared schema's rules, said on the row. */
export function draftErrors(draft: DocumentDraft): DraftErrors {
  if (!draft.type) return { type: 'Choose what this document is' }
  const errors: DraftErrors = {}
  const parsed = newDocumentInput.safeParse(candidate(SAMPLE_FILE_ID, draft, draft.type))
  for (const issue of parsed.error?.issues ?? []) {
    const field = issue.path[0]
    if (field === 'name' || field === 'number' || field === 'issuedOn') {
      errors[field] ??= issue.message
    }
  }
  // Add parcel's own rules (createParcelInput checks them across the list).
  if (draft.type === 'other' && !draft.name.trim()) {
    errors.name = 'Name this document, e.g. Query letter'
  }
  if (draft.issuedOn && draft.issuedOn > todayInLagos()) {
    errors.issuedOn = 'Enter a date on or before today.'
  }
  return errors
}

/** A finished, described upload as Add parcel sends it. */
export function documentInput(fileId: string, draft: DocumentDraft): NewDocumentInput {
  return newDocumentInput.parse(candidate(fileId, draft, draft.type || 'other'))
}

export function useParcelDocuments() {
  const uploads = useFileUpload({ purpose: 'title_document' })
  const [drafts, setDrafts] = useState<Record<string, DocumentDraft>>({})
  const [checked, setChecked] = useState(false)

  const draftOf = useCallback(
    (item: UploadItem): DocumentDraft => drafts[item.key] ?? { ...EMPTY, type: asType(item.guess) },
    [drafts],
  )
  const change = useCallback(
    (item: UploadItem, patch: Partial<DocumentDraft>) =>
      setDrafts((all) => ({
        ...all,
        [item.key]: { ...(all[item.key] ?? { ...EMPTY, type: asType(item.guess) }), ...patch },
      })),
    [],
  )

  // Removed rows don't keep their drafts in the count.
  const live = uploads.items.filter((item) => item.status !== 'failed')
  const types = live
    .map((item) => draftOf(item).type)
    .filter((t): t is TitleDocumentType => t !== '')

  /** Before Save: every finished file described. Errors show on their rows from now on. */
  function collect(): { ok: true; documents: NewDocumentInput[] } | { ok: false } {
    setChecked(true)
    const ready = uploads.done.flatMap((item) =>
      item.fileId ? [{ fileId: item.fileId, draft: draftOf(item) }] : [],
    )
    if (ready.some(({ draft }) => Object.keys(draftErrors(draft)).length > 0)) return { ok: false }
    return { ok: true, documents: ready.map(({ fileId, draft }) => documentInput(fileId, draft)) }
  }

  return {
    uploads,
    draftOf,
    change,
    /** Row errors, shown once Save has been tried. */
    errorsOf: (item: UploadItem) => (checked ? draftErrors(draftOf(item)) : {}),
    /** The described document types, for the stages preview. */
    types,
    collect,
    dirty: uploads.items.length > 0,
  }
}

export type ParcelDocuments = ReturnType<typeof useParcelDocuments>
