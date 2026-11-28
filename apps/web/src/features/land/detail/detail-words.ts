import {
  documentLabel,
  formatFileSize,
  type StageUpdateStatus,
  TITLE_STAGE_STATUS_LABELS,
  type TitleDocument,
  type TitleStage,
  type TitleStageStatus,
} from '@vento/shared'
import { formatDate } from '@/lib/format'
import { stageLabel } from '../land-words'

/*
 * The parcel page's words (spec "UI copy": tracker, stage sheet, documents, toasts), beside
 * land-words, which the list shares. No zod and no decimal.js: the detail route imports it.
 */

/** What the stage sheet offers, in the order a file moves through a registry. */
export const STAGE_STATUS_OPTIONS: readonly { value: StageUpdateStatus; label: string }[] = [
  { value: 'in_progress', label: TITLE_STAGE_STATUS_LABELS.in_progress },
  { value: 'submitted', label: TITLE_STAGE_STATUS_LABELS.submitted },
  { value: 'queried', label: TITLE_STAGE_STATUS_LABELS.queried },
  { value: 'granted', label: TITLE_STAGE_STATUS_LABELS.granted },
  { value: 'rejected', label: TITLE_STAGE_STATUS_LABELS.rejected },
]

const PAST: Readonly<Record<TitleStageStatus, string>> = {
  not_started: 'not started',
  in_progress: 'in progress',
  submitted: 'submitted',
  queried: 'queried',
  granted: 'granted',
  rejected: 'rejected',
}

/** "C of O granted", "Governor's consent submitted", "Survey plan in progress". */
export const stageSavedToast = (stage: Pick<TitleStage, 'type'>, status: TitleStageStatus) =>
  `${stageLabel(stage.type)} ${PAST[status]}`

/** "Update C of O" on the header and the phone's sticky bar. */
export const updateStageLabel = (stage: Pick<TitleStage, 'type'>) =>
  `Update ${stageLabel(stage.type)}`

/** "v2 · 2 earlier", "v1". */
export function versionLine(doc: Pick<TitleDocument, 'latest' | 'earlierCount'>): string {
  if (!doc.latest) return ''
  const v = `v${doc.latest.versionNo}`
  return doc.earlierCount > 0 ? `${v} · ${doc.earlierCount} earlier` : v
}

/** "C of O v2", "Family receipt · Adeyemi family v1". */
export const versionName = (doc: Pick<TitleDocument, 'type' | 'name'>, versionNo: number) =>
  `${documentLabel(doc.type, doc.name)} v${versionNo}`

/** The row's second line: number, issuer, size ("CO/23/2025 · Lands Bureau · 1.2 MB"). */
export function versionFacts(
  version: NonNullable<TitleDocument['latest']>,
  { size = true }: { size?: boolean } = {},
): string {
  return [
    version.number,
    version.issuedBy,
    version.issuedOn ? `Issued ${formatDate(version.issuedOn)}` : null,
    size ? formatFileSize(version.file.sizeBytes) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** HEIC photos (iPhone) don't open in most browsers: they download instead. */
export const canPreview = (contentType: string) =>
  contentType === 'application/pdf' || /^image\/(jpeg|png|webp)$/.test(contentType)

/** The short kind tag on a row: "PDF", "JPG", "PNG", "HEIC". */
export function fileKind(contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF'
  if (contentType === 'image/jpeg') return 'JPG'
  if (contentType === 'image/png') return 'PNG'
  if (contentType.startsWith('image/hei')) return 'HEIC'
  return 'File'
}

export const DETAIL_COPY = {
  titleStage: 'Title stage',
  editStages: 'Edit stages',
  noStages: 'No title stages yet. Add the stages this land goes through.',
  documents: 'Documents',
  activity: 'Activity',
  uploadDocument: 'Upload document',
  vaultHint: "Up to 25 MB. A file of a type that's already here becomes a new version.",
  vaultEmpty:
    'No documents yet. Upload the survey plan, C of O or any paper for this land; each type keeps its versions.',
  vaultEmptyReadOnly: 'No documents on this parcel.',
  activityEmpty: 'Nothing has happened on this parcel yet.',
  activityError: "The activity couldn't load. Check your connection and try again.",
  versionsError: "Earlier versions couldn't load.",
  tooManyLinks: "You've opened a lot of documents in the last few minutes. Try again shortly.",
  versionGone: 'That version was removed. Open the latest one instead.',
  offlineLink: "You're offline. Documents open when you're back online.",
  linkError: "That document couldn't open. Check your connection and try again.",
  archived: 'Parcel archived',
  restored: 'Parcel restored',
  stagesSaved: 'Title stages saved',
  undone: 'Update undone',
  versionRemoved: (label: string) => `${label} removed`,
  versionRestored: (label: string) => `${label} is back`,
  uploaded: (label: string) => `${label} uploaded`,
} as const

export const UNDO_MS = 8000
