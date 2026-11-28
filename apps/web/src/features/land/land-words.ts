import {
  type ChosenParcelStatus,
  documentLabel,
  PARCEL_STATUS_LABELS,
  type ParcelRow,
  type ParcelStatus,
  TITLE_DOCUMENTS,
  TITLE_STAGE_LABELS,
  TITLE_STAGE_STATUS_LABELS,
  type TitleDocumentType,
  type TitleStageStatus,
  type TitleStageType,
} from '@vento/shared'
import type { StatusTone } from '@/components/status-badge'
import { formatDate } from '@/lib/format'
import type { ParcelsFilter } from './parcels-search'

/*
 * Every word Land & title shows (spec "UI copy"), in one place, so the list, the sheets, the
 * detail page, ⌘K and Home read the same. Labels come from the shared catalogs; tones from the
 * design system's status colours. No zod and no decimal.js here: the list route imports it.
 */

export const LAND_TITLE = 'Land & title'

export const PARCEL_STATUS_TONE: Readonly<Record<ParcelStatus, StatusTone>> = {
  prospect: 'slate',
  under_acquisition: 'amber',
  acquired: 'blue',
  titled: 'emerald',
  in_development: 'blue',
  sold_out: 'slate',
}

/** The badge a parcel wears: archived wins over its status. */
export function parcelBadge(parcel: Pick<ParcelRow, 'status' | 'archivedAt'>): {
  label: string
  tone: StatusTone
} {
  if (parcel.archivedAt) return { label: 'Archived', tone: 'slate' }
  return { label: PARCEL_STATUS_LABELS[parcel.status], tone: PARCEL_STATUS_TONE[parcel.status] }
}

/** What Add / Edit parcel offers; titled is automatic, the others belong to Projects and Sales. */
export const CHOSEN_STATUS_OPTIONS: readonly { value: ChosenParcelStatus; label: string }[] = [
  { value: 'prospect', label: PARCEL_STATUS_LABELS.prospect },
  { value: 'under_acquisition', label: PARCEL_STATUS_LABELS.under_acquisition },
  { value: 'acquired', label: PARCEL_STATUS_LABELS.acquired },
]

export const STAGE_STATUS_TONE: Readonly<Record<TitleStageStatus, StatusTone>> = {
  not_started: 'slate',
  in_progress: 'blue',
  submitted: 'amber',
  queried: 'amber',
  granted: 'emerald',
  rejected: 'rose',
}

export const stageLabel = (type: TitleStageType): string => TITLE_STAGE_LABELS[type]

/**
 * A stage's state as the tracker reads it: "Not started", "In progress", "Submitted 10 Oct 2026",
 * "Queried 3 Nov 2026", "Granted 2 Sep 2025", "Granted · date not recorded", "Rejected".
 */
export function stageStatusText(status: TitleStageStatus, on: string | null): string {
  const label = TITLE_STAGE_STATUS_LABELS[status]
  if (status === 'not_started' || status === 'in_progress' || status === 'rejected') return label
  if (on) return `${label} ${formatDate(on)}`
  return status === 'granted' ? 'Granted · date not recorded' : label
}

/** The list's title stage line: "C of O · Submitted 10 Oct 2026", or "All stages granted". */
export function currentStageLine(parcel: Pick<ParcelRow, 'currentStage' | 'stagesTotal'>): string {
  const stage = parcel.currentStage
  if (!stage) return parcel.stagesTotal > 0 ? 'All stages granted' : 'No title stages'
  return `${stageLabel(stage.type)} · ${stageStatusText(stage.status, stage.statusOn)}`
}

/** "Stage 3 of 4" (spec tracker), counting the current one. */
export function stageCountText(parcel: Pick<ParcelRow, 'stagesGranted' | 'stagesTotal'>): string {
  const n = Math.min(parcel.stagesGranted + 1, parcel.stagesTotal)
  return `Stage ${n} of ${parcel.stagesTotal}`
}

/** "C of O", "Family receipt · Adeyemi family", "Query letter". */
export const documentTypeLabel = (type: TitleDocumentType): string => TITLE_DOCUMENTS[type].label
export { documentLabel }

/** Document types in the order the type picker lists them: stages first, then the rest. */
export const DOCUMENT_TYPE_OPTIONS: readonly { value: TitleDocumentType; label: string }[] = (
  Object.keys(TITLE_DOCUMENTS) as TitleDocumentType[]
).map((value) => ({ value, label: TITLE_DOCUMENTS[value].label }))

export const PARCEL_FILTER_CHIPS: readonly { value: ParcelsFilter | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'titled', label: 'Titled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'archived', label: 'Archived' },
]

/** "Ibeju-Lekki LGA, Lagos"; the FCT's area councils read "Abuja Municipal, FCT". */
export function lgaLine(parcel: Pick<ParcelRow, 'lga' | 'state'>): string {
  // Not shared's stateLabel: nigeria.ts builds zod enums, and this file is on the list route.
  return parcel.state === 'FCT' ? `${parcel.lga}, FCT` : `${parcel.lga} LGA, ${parcel.state}`
}

/** "Ibeju-Lekki" (the area), or the LGA when no area was typed. */
export const placeName = (parcel: Pick<ParcelRow, 'area' | 'lga'>): string =>
  parcel.area ?? parcel.lga

const grouped = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * m² as stored ("42000.00") → "4.20 ha", half up to two decimals, as lists show sizes. String and
 * BigInt arithmetic, so the list page doesn't load decimal.js; matches shared `hectares()`.
 */
export function hectaresText(sqm: string): string {
  const [whole = '0', fraction = ''] = sqm.trim().split('.')
  const cents = BigInt(whole || '0') * 100n + BigInt(`${fraction}00`.slice(0, 2))
  // Hundredths of a hectare = m² / 100 = cents / 10,000, rounded half up.
  const hundredths = (cents + 5000n) / 10000n
  const ha = hundredths / 100n
  const rest = (hundredths % 100n).toString().padStart(2, '0')
  return `${grouped(ha.toString())}.${rest} ha`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The list subtitle: "6 parcels · 45.00 ha". Blocked parcels join it in slice 2. */
export function parcelsSummaryLine(summary: { count: number; totalSqm: string }): string {
  if (summary.count === 0) return 'No parcels yet'
  return `${plural(summary.count, 'parcel', 'parcels')} · ${hectaresText(summary.totalSqm)}`
}

/** Read-only banners (spec): the parcel or its company is archived. */
export function readOnlyText(
  readOnly: 'archived' | 'entity_archived',
  companyName: string,
): string {
  return readOnly === 'archived'
    ? 'This parcel is archived. Restore it to make changes.'
    : `${companyName} is archived. Restore the company to change this parcel.`
}

export const LAND_COPY = {
  subtitleEmpty: 'No parcels yet',
  addParcel: 'Add parcel',
  editParcel: 'Edit parcel',
  saveParcel: 'Save parcel',
  search: 'Search parcels',
  empty:
    "No parcels yet. A parcel holds a piece of land's title stages, documents and any claims on it.",
  filteredEmpty: 'No parcels match these filters.',
  clearFilters: 'Clear filters',
  loadError: "Parcels couldn't load. Check your connection and try again.",
  parcelLoadError: "This parcel couldn't load. Check your connection and try again.",
  parcelNotFound: "We couldn't find that parcel. It may be in a company you can't see.",
  offline: "You're offline. Your changes are kept; save when you're back online.",
  dropTitle: 'Drop PDFs or photos here, or choose files',
  permission: 'Only Land & legal can add parcels. Ask your organization owner.',
} as const

/** "There's already a parcel called Plot 22, Folu Ayo." (the hint's link says "Open it"). */
export const nameTakenText = (name: string) => `There's already a parcel called ${name}.`

/** Toasts. */
export const parcelAddedToast = (name: string) => `${name} added`
export const parcelUpdatedToast = (name: string) => `${name} updated`
