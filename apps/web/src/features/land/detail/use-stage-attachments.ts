import {
  type StageUpdateStatus,
  TITLE_DOCUMENT_TYPES,
  TITLE_DOCUMENTS,
  type TitleDocumentType,
  type TitleStageType,
} from '@vento/shared'
import { useCallback, useState } from 'react'
import type { UploadItem } from '@/lib/upload/upload-item'
import { useFileUpload } from '@/lib/upload/use-file-upload'

/*
 * Files attached in the stage sheet. With Granted they're the stage's own document (its next
 * version); with any other status they're usually the registry's letter, so they start as a
 * named "other" document ("Query letter") and never become a version of the title itself.
 */

export type AttachmentDraft = { type: TitleDocumentType; name: string }

/** The registry's paper that usually comes with each status (spec examples). */
const LETTER: Record<Exclude<StageUpdateStatus, 'granted'>, string> = {
  // Before it's submitted, the paper is usually the application being prepared.
  in_progress: 'Application form',
  submitted: 'Application acknowledgement',
  queried: 'Query letter',
  rejected: 'Rejection letter',
}

export function defaultAttachment(
  status: StageUpdateStatus,
  stage: TitleStageType,
): AttachmentDraft {
  if (status === 'granted') return { type: stage, name: '' }
  return { type: 'other', name: LETTER[status] }
}

export const asDocumentType = (value: string): TitleDocumentType | undefined =>
  TITLE_DOCUMENT_TYPES.find((t) => t === value)

/** "Name this document, e.g. Query letter" for an unnamed other; nothing otherwise. */
export function attachmentError(draft: AttachmentDraft): string | null {
  return draft.type === 'other' && !draft.name.trim()
    ? 'Name this document, e.g. Query letter'
    : null
}

export function useStageAttachments(stage: TitleStageType, status: StageUpdateStatus) {
  const uploads = useFileUpload({ purpose: 'title_document' })
  const [drafts, setDrafts] = useState<Record<string, AttachmentDraft>>({})
  // A file's type is settled when it's dropped: changing the status afterwards doesn't turn a
  // dropped C of O into a "Query letter".
  const undescribed = uploads.items.filter((item) => !drafts[item.key])
  if (undescribed.length > 0) {
    const next = { ...drafts }
    for (const item of undescribed) next[item.key] = defaultAttachment(status, stage)
    setDrafts(next)
  }

  const draftOf = useCallback(
    (item: UploadItem): AttachmentDraft => drafts[item.key] ?? defaultAttachment(status, stage),
    [drafts, status, stage],
  )
  const change = (item: UploadItem, patch: Partial<AttachmentDraft>) =>
    setDrafts((all) => ({ ...all, [item.key]: { ...draftOf(item), ...patch } }))

  const ready = uploads.done.flatMap((item) =>
    item.fileId ? [{ item, fileId: item.fileId, draft: draftOf(item) }] : [],
  )

  return {
    uploads,
    draftOf,
    change,
    /** Some finished file is the stage's own document (granted's evidence). */
    hasEvidence: ready.some(({ draft }) => draft.type === stage),
    invalid: ready.some(({ draft }) => attachmentError(draft) !== null),
    /** What the update sends: only the name a type takes. */
    toSend: () =>
      ready.map(({ fileId, draft }) => ({
        fileId,
        type: draft.type,
        name: TITLE_DOCUMENTS[draft.type].multiple && draft.name.trim() ? draft.name.trim() : null,
      })),
    dirty: uploads.items.length > 0,
  }
}

export type StageAttachments = ReturnType<typeof useStageAttachments>
