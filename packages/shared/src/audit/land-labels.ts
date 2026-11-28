import {
  documentWord,
  PARCEL_STATUS_LABELS,
  type ParcelStatus,
  TITLE_DOCUMENT_TYPES,
  TITLE_STAGE_LABELS,
  TITLE_STAGE_STATUS_LABELS,
  TITLE_STAGE_TYPES,
  type TitleDocumentType,
  type TitleStageStatus,
  type TitleStageType,
} from '../land/catalog'

// Land & title audit events in plain words. With the parcel's name (the audit log) the sentence
// ends "· Plot 22, Folu Ayo"; without it (the parcel's own Activity) it stops before.

type Event = {
  targetLabel: string | null
  metadata: Readonly<Record<string, unknown>> | null
}

const text = (e: Event, key: string): string | null => {
  const v = e.metadata?.[key]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

const oneOf = <T extends string>(list: readonly T[], v: string | null): T | null =>
  v !== null && (list as readonly string[]).includes(v) ? (v as T) : null

const onParcel = (words: string, e: Event): string =>
  e.targetLabel ? `${words} · ${e.targetLabel}` : words

function stageWords(e: Event): string | null {
  const type = oneOf<TitleStageType>(TITLE_STAGE_TYPES, text(e, 'stageType'))
  return type ? TITLE_STAGE_LABELS[type] : null
}

const STATUS_WORDS = Object.fromEntries(
  Object.entries(TITLE_STAGE_STATUS_LABELS).map(([k, v]) => [k, v.toLowerCase()]),
) as Record<TitleStageStatus, string>

function statusWord(e: Event, key: string): string | null {
  const status = oneOf<TitleStageStatus>(
    Object.keys(STATUS_WORDS) as TitleStageStatus[],
    text(e, key),
  )
  return status ? STATUS_WORDS[status] : null
}

/** "C of O v2", "family receipt (Adeyemi family) v1", "Query letter v1". */
function versionWords(e: Event): string | null {
  const type = oneOf<TitleDocumentType>(TITLE_DOCUMENT_TYPES, text(e, 'documentType'))
  if (!type) return null
  const n = e.metadata?.versionNo
  const word = documentWord(type, text(e, 'documentName'))
  return typeof n === 'number' && Number.isInteger(n) ? `${word} v${n}` : word
}

export const landWhat = {
  parcelCreated: (e: Event): string =>
    e.targetLabel ? `Added parcel ${e.targetLabel}` : 'Added the parcel',

  parcelUpdated: (e: Event): string => {
    // Titled and back: the status follows the stages on its own (plan §3).
    const to = text(e, 'automatic')
    if (to === 'titled') return onParcel('Titled: every stage is granted', e)
    if (to) {
      const label = PARCEL_STATUS_LABELS[to as ParcelStatus] ?? 'Acquired'
      return onParcel(`Back to ${label}: a stage is no longer granted`, e)
    }
    return e.targetLabel ? `Changed parcel ${e.targetLabel}` : 'Changed the parcel'
  },

  stageUpdated: (e: Event): string => {
    const stage = stageWords(e)
    if (!stage) return onParcel('Updated a title stage', e)
    if (e.metadata?.undo === true) {
      const undone = statusWord(e, 'undoneStatus')
      return onParcel(undone ? `Undid ${stage} ${undone}` : `Undid the ${stage} update`, e)
    }
    const status = statusWord(e, 'status')
    return onParcel(status ? `${stage} ${status}` : `Updated ${stage}`, e)
  },

  stagesChanged: (e: Event): string => onParcel('Changed the title stages', e),

  documentUploaded: (e: Event): string => {
    const doc = versionWords(e)
    return onParcel(doc ? `Uploaded ${doc}` : 'Uploaded a title document', e)
  },

  documentRemoved: (e: Event): string => {
    const doc = versionWords(e)
    const reason = text(e, 'reason')
    const what = doc ? `Removed ${doc}` : 'Removed a title document version'
    const from = e.targetLabel ? `${what} from ${e.targetLabel}` : what
    return reason ? `${from} · ${reason}` : from
  },

  documentRestored: (e: Event): string => {
    const doc = versionWords(e)
    return onParcel(doc ? `Restored ${doc}` : 'Restored a title document version', e)
  },

  linkIssued: (e: Event): string => {
    const doc = versionWords(e) ?? 'a title document'
    const verb = text(e, 'disposition') === 'inline' ? 'Previewed' : 'Downloaded'
    return onParcel(`${verb} ${doc}`, e)
  },
}
