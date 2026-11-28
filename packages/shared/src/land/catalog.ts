import type { NigerianState } from '../common/nigeria'

// Land & title catalogs (spec open question 6, owner 28 Nov 2026). Order is data here, not enum
// order in Postgres: SQL sorts with array_position(TITLE_STAGE_TYPES, type), so a lawyer's
// reordering is a code change, never an enum migration. No zod, so the web can import it alone.

/** Catalog order: a deed of assignment comes before the governor's consent that perfects it. */
export const TITLE_STAGE_TYPES = [
  'survey_plan',
  'excision_gazette',
  'r_of_o',
  'c_of_o',
  'deed_of_assignment',
  'governors_consent',
] as const
export type TitleStageType = (typeof TITLE_STAGE_TYPES)[number]

export const TITLE_STAGE_LABELS: Readonly<Record<TitleStageType, string>> = {
  survey_plan: 'Survey plan',
  excision_gazette: 'Excision gazette',
  r_of_o: 'R of O',
  c_of_o: 'C of O',
  deed_of_assignment: 'Deed of assignment',
  governors_consent: "Governor's consent",
}

/** Registries don't move in order: any status can follow any other (not back to not_started). */
export const TITLE_STAGE_STATUSES = [
  'not_started',
  'in_progress',
  'submitted',
  'queried',
  'granted',
  'rejected',
] as const
export type TitleStageStatus = (typeof TITLE_STAGE_STATUSES)[number]

export const TITLE_STAGE_STATUS_LABELS: Readonly<Record<TitleStageStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  queried: 'Queried',
  granted: 'Granted',
  rejected: 'Rejected',
}

/** What the stage sheet offers; not_started is the initial state only. */
export const STAGE_UPDATE_STATUSES = [
  'in_progress',
  'submitted',
  'queried',
  'granted',
  'rejected',
] as const satisfies readonly TitleStageStatus[]
export type StageUpdateStatus = (typeof STAGE_UPDATE_STATUSES)[number]

/** Statuses that offer *Follow up by*; the date is cleared on any other. */
export const FOLLOW_UP_STATUSES = [
  'submitted',
  'queried',
] as const satisfies readonly TitleStageStatus[]

export function allowsFollowUp(status: TitleStageStatus): boolean {
  return (FOLLOW_UP_STATUSES as readonly string[]).includes(status)
}

/** Statuses that need *What happened*. */
export function needsNote(status: TitleStageStatus): boolean {
  return status === 'queried' || status === 'rejected'
}

/** "Say what the registry asked for." / "Say why it was rejected." */
export function noteRequiredMessage(status: TitleStageStatus): string {
  return status === 'rejected' ? 'Say why it was rejected.' : 'Say what the registry asked for.'
}

/**
 * New parcels' stages: Survey plan, Excision gazette, C of O; in the FCT (AGIS) Survey plan,
 * R of O, C of O. Deed of assignment and governor's consent apply to land bought with a title,
 * so they're added with Edit stages.
 */
export function defaultStagesFor(state: NigerianState): TitleStageType[] {
  return state === 'FCT'
    ? ['survey_plan', 'r_of_o', 'c_of_o']
    : ['survey_plan', 'excision_gazette', 'c_of_o']
}

/** The sheet's pre-selected status: not started or in progress → submitted; else → granted. */
export function likelyNextStatus(current: TitleStageStatus): StageUpdateStatus {
  if (current === 'not_started' || current === 'in_progress') return 'submitted'
  if (current === 'submitted' || current === 'queried') return 'granted'
  return current === 'rejected' ? 'submitted' : 'granted'
}

/** Stages in catalog order. */
export function inCatalogOrder<T extends { type: TitleStageType }>(stages: readonly T[]): T[] {
  return [...stages].sort(
    (a, b) => TITLE_STAGE_TYPES.indexOf(a.type) - TITLE_STAGE_TYPES.indexOf(b.type),
  )
}

/** The current stage: the first one in catalog order that isn't granted. */
export function currentStageOf<T extends { type: TitleStageType; status: TitleStageStatus }>(
  stages: readonly T[],
): T | null {
  return inCatalogOrder(stages).find((s) => s.status !== 'granted') ?? null
}

export const TITLE_DOCUMENT_TYPES = [
  ...TITLE_STAGE_TYPES,
  'family_receipt',
  'land_purchase_agreement',
  'other',
] as const
export type TitleDocumentType = (typeof TITLE_DOCUMENT_TYPES)[number]

export type TitleDocumentDef = {
  label: string
  /** Mid-sentence: "Removed survey plan v2". Acronyms keep their capitals. */
  word: string
  /**
   * May hold several separate documents (land bought from several families, several deeds):
   * the sheet offers **Add as a separate document**, which needs a short name. Others are one
   * document per parcel, and a same-type upload is its next version.
   */
  multiple: boolean
  /** The stage this document is evidence for; granted needs one. */
  stageType: TitleStageType | null
}

export const TITLE_DOCUMENTS: Readonly<Record<TitleDocumentType, TitleDocumentDef>> = {
  survey_plan: {
    label: 'Survey plan',
    word: 'survey plan',
    multiple: false,
    stageType: 'survey_plan',
  },
  excision_gazette: {
    label: 'Excision gazette',
    word: 'excision gazette',
    multiple: false,
    stageType: 'excision_gazette',
  },
  r_of_o: { label: 'R of O', word: 'R of O', multiple: false, stageType: 'r_of_o' },
  c_of_o: { label: 'C of O', word: 'C of O', multiple: false, stageType: 'c_of_o' },
  deed_of_assignment: {
    label: 'Deed of assignment',
    word: 'deed of assignment',
    multiple: true,
    stageType: 'deed_of_assignment',
  },
  governors_consent: {
    label: "Governor's consent",
    word: "governor's consent",
    multiple: false,
    stageType: 'governors_consent',
  },
  family_receipt: {
    label: 'Family receipt',
    word: 'family receipt',
    multiple: true,
    stageType: null,
  },
  land_purchase_agreement: {
    label: 'Land purchase agreement',
    word: 'land purchase agreement',
    multiple: true,
    stageType: null,
  },
  other: { label: 'Other', word: 'document', multiple: true, stageType: null },
}

/** The document type that is evidence for a stage (same key). */
export function documentTypeForStage(stage: TitleStageType): TitleDocumentType {
  return stage
}

/** "C of O", "Family receipt · Adeyemi family", "Query letter". */
export function documentLabel(type: TitleDocumentType, name: string | null): string {
  if (type === 'other') return name ?? TITLE_DOCUMENTS.other.label
  const label = TITLE_DOCUMENTS[type].label
  return name ? `${label} · ${name}` : label
}

/** Mid-sentence: "survey plan", "C of O", "family receipt (Adeyemi family)", "Query letter". */
export function documentWord(type: TitleDocumentType, name: string | null): string {
  if (type === 'other') return name ?? TITLE_DOCUMENTS.other.word
  const word = TITLE_DOCUMENTS[type].word
  return name ? `${word} (${name})` : word
}

export const PARCEL_STATUSES = [
  'prospect',
  'under_acquisition',
  'acquired',
  'titled',
  'in_development',
  'sold_out',
] as const
export type ParcelStatus = (typeof PARCEL_STATUSES)[number]

/** Set by a person; `titled` is automatic, the last two belong to Projects and Sales. */
export const CHOSEN_PARCEL_STATUSES = [
  'prospect',
  'under_acquisition',
  'acquired',
] as const satisfies readonly ParcelStatus[]
export type ChosenParcelStatus = (typeof CHOSEN_PARCEL_STATUSES)[number]

export const PARCEL_STATUS_LABELS: Readonly<Record<ParcelStatus, string>> = {
  prospect: 'Prospect',
  under_acquisition: 'Under acquisition',
  acquired: 'Acquired',
  titled: 'Titled',
  in_development: 'In development',
  sold_out: 'Sold out',
}

/** A stage with no movement this long (Lagos days) is stalled on the Land & legal home. */
export const STALLED_AFTER_DAYS = 90

/** How long after a stage update its Undo is offered (the toast's life, plus a margin). */
export const STAGE_UNDO_SECONDS = 120
