import { z } from 'zod'
import { auditActor, auditFieldChange } from '../audit/schema'
import { Decimal } from '../common/decimal'
import { money } from '../common/money'
import { nigerianState } from '../common/nigeria'
import { findLga } from '../common/nigeria-lgas'
import { id, isoDate, paginated, paginationInput } from '../common/schemas'
import {
  HIDDEN_CHARACTERS_IN_TEXT_MESSAGE,
  HIDDEN_CHARACTERS_MESSAGE,
  hasHiddenCharacters,
  hasHiddenCharactersInText,
} from '../common/text'
import {
  CHOSEN_PARCEL_STATUSES,
  needsNote,
  noteRequiredMessage,
  PARCEL_STATUSES,
  STAGE_UPDATE_STATUSES,
  TITLE_DOCUMENT_TYPES,
  TITLE_DOCUMENTS,
  TITLE_STAGE_STATUSES,
  TITLE_STAGE_TYPES,
} from './catalog'
import { MAX_SIZE_SQM, SIZE_UNITS, sizeSqmDecimal } from './size'

export const parcelStatus = z.enum(PARCEL_STATUSES)
export const chosenParcelStatus = z.enum(CHOSEN_PARCEL_STATUSES)
export const sizeUnit = z.enum(SIZE_UNITS)
export const titleStageType = z.enum(TITLE_STAGE_TYPES)
export const titleStageStatus = z.enum(TITLE_STAGE_STATUSES)
export const stageUpdateStatus = z.enum(STAGE_UPDATE_STATUSES)
export const titleDocumentType = z.enum(TITLE_DOCUMENT_TYPES)

/** Short free text: trimmed, '' means none (stored as null). */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { message: `Use ${max} characters or fewer for ${label}` })
    .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null)

/** Longer text (notes), where line breaks are fine but other hidden characters aren't. */
const optionalNotes = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Use ${max} characters or fewer` })
    .refine((v) => !hasHiddenCharactersInText(v), { message: HIDDEN_CHARACTERS_IN_TEXT_MESSAGE })
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null)

export const parcelName = z
  .string()
  .trim()
  .min(2, { message: 'Enter a parcel name of at least 2 characters' })
  .max(120, { message: 'Use 120 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

const SIZE_PATTERN = /^\d{1,10}(\.\d{1,4})?$/

/** Up to 10 digits and 4 decimals, above zero ("4.2", "12", "1250.5"). */
const sizeValue = z
  .string()
  .trim()
  .regex(SIZE_PATTERN, { message: 'Enter a size like 4.2 or 600' })
  .refine((v) => new Decimal(v).gt(0), { message: 'Enter a size above zero' })

const PLOT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/

const plotSize = z
  .string()
  .trim()
  .regex(PLOT_PATTERN, { message: 'Enter a plot size in m², like 600 or 648' })
  .refine((v) => new Decimal(v).gt(0), { message: 'Enter a plot size above zero' })

export const parcelSizeInput = z
  .strictObject({ value: sizeValue, unit: sizeUnit, plotSizeSqm: plotSize.nullish() })
  .superRefine((v, ctx) => {
    // The field checks run first but don't stop this one: only a well-formed size above zero.
    if (!SIZE_PATTERN.test(v.value) || new Decimal(v.value).lte(0)) return
    if (v.plotSizeSqm && (!PLOT_PATTERN.test(v.plotSizeSqm) || new Decimal(v.plotSizeSqm).lte(0)))
      return
    const sqm = sizeSqmDecimal(v)
    if (sqm.gt(MAX_SIZE_SQM)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a smaller size' })
    } else if (sqm.toDecimalPlaces(2).lte(0)) {
      // Stored to 0.01 m²: anything that rounds to nothing would fail the database's check.
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a size of at least 0.01 m²' })
    }
  })
export type ParcelSizeInput = z.input<typeof parcelSizeInput>

const lgaText = z.string().trim().min(1, { message: 'Choose an LGA' }).max(80)

/** One file dropped into *Documents* while adding a parcel. */
export const newDocumentInput = z.strictObject({
  fileId: id,
  type: titleDocumentType,
  /** Needed for `other` ("Query letter"); a short name tells several receipts apart. */
  name: optionalText(80, 'the name'),
  number: optionalText(100, 'the number'),
  issuedOn: isoDate.nullish(),
  issuedBy: optionalText(120, 'the issuer'),
})
export type NewDocumentInput = z.input<typeof newDocumentInput>

/** `other` needs a name; one-of-a-kind types never carry one (they're versions of one file). */
function checkDocumentName(
  v: { type: z.infer<typeof titleDocumentType>; name: string | null; separate?: boolean },
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (v.type === 'other' && !v.name) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'name'],
      message: 'Name this document, e.g. Query letter',
    })
  } else if (v.separate && !v.name) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'name'],
      message: 'Which one? e.g. Adeyemi family',
    })
  } else if (v.name && !TITLE_DOCUMENTS[v.type].multiple) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'name'],
      message: 'Only receipts, agreements, deeds and other documents take a name',
    })
  }
}

const uniqueStages = z
  .array(titleStageType)
  .min(1, { message: 'Keep at least one title stage' })
  .max(TITLE_STAGE_TYPES.length)
  .refine((s) => new Set(s).size === s.length, { message: 'Pick each stage once' })

function checkLga(v: { state?: unknown; lga?: unknown }, ctx: z.RefinementCtx): void {
  const parsedState = nigerianState.safeParse(v.state)
  if (!parsedState.success || typeof v.lga !== 'string') return
  if (!findLga(parsedState.data, v.lga)) {
    ctx.addIssue({ code: 'custom', path: ['lga'], message: `Pick an LGA in ${v.state}.` })
  }
}

/** The LGA as listed ("amac" → "Abuja Municipal"), once checkLga has passed. */
function canonicalLga<T extends { state?: z.infer<typeof nigerianState>; lga?: string }>(v: T): T {
  if (!v.state || v.lga === undefined) return v
  return { ...v, lga: findLga(v.state, v.lga) ?? v.lga }
}

const parcelFields = {
  name: parcelName,
  state: nigerianState,
  lga: lgaText,
  area: optionalText(120, 'the area'),
  size: parcelSizeInput,
  status: chosenParcelStatus,
  entityId: id,
  acquiredOn: isoDate.nullish(),
  /** NGN; shown only to people who can edit Land & title or view Finance. */
  acquisitionCost: money.nullish(),
  /** "Bought from": personal data, never logged; seen only by those who see the cost. */
  seller: optionalText(200, 'who it was bought from'),
  notes: optionalNotes(2000),
}

export const createParcelInput = z
  .strictObject({
    ...parcelFields,
    status: chosenParcelStatus.default('under_acquisition'),
    documents: z
      .array(newDocumentInput)
      .max(10, { message: 'Add up to 10 documents at once' })
      .default([]),
    /** Default: defaultStagesFor(state). */
    stages: uniqueStages.optional(),
  })
  .superRefine((v, ctx) => {
    checkLga(v, ctx)
    v.documents.forEach((d, i) => {
      checkDocumentName(d, ctx, ['documents', i])
    })
  })
  .transform(canonicalLga)
export type CreateParcelInput = z.input<typeof createParcelInput>

/**
 * Only the fields sent change. `expectedVersion` is the parcel's `version` as loaded; a change in
 * between answers CONFLICT `stale` with who saved it.
 */
export const updateParcelInput = z
  .strictObject(parcelFields)
  .partial()
  .extend({ id, expectedVersion: z.number().int().min(1) })
  .superRefine(checkLga)
  .transform(canonicalLga)
export type UpdateParcelInput = z.input<typeof updateParcelInput>

export const PARCEL_FILTERS = ['all', 'titled', 'in_progress', 'archived'] as const
export const PARCEL_SORTS = ['name', 'reference', 'size', 'updated'] as const

export const listParcelsInput = paginationInput.extend({
  /** Name, area, LGA or reference ("P-0012", "p-12", "12"). */
  q: z.string().trim().max(100).optional(),
  filter: z.enum(PARCEL_FILTERS).default('all'),
  sort: z.enum(PARCEL_SORTS).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  /** The company switcher (decision 0014), intersected with the viewer's companies. */
  entityId: id.optional(),
})
export type ListParcelsInput = z.input<typeof listParcelsInput>

export const parcelNameTakenInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  excludeId: id.optional(),
})

export const parcelActivityInput = paginationInput.extend({ id })

const stageSummary = z.object({
  type: titleStageType,
  status: titleStageStatus,
  statusOn: isoDate.nullable(),
})

export const parcelRow = z.object({
  id,
  /** "P-0012". */
  reference: z.string(),
  referenceNumber: z.number().int().min(1),
  name: z.string(),
  state: nigerianState,
  lga: z.string(),
  area: z.string().nullable(),
  /** m², "42000.00"; sizeText() reads it as "4.20 ha". */
  sizeSqm: z.string(),
  sizeUnit,
  /** As typed, in `sizeUnit` ("12" plots). */
  sizeEntered: z.string(),
  /** Plots only. */
  plotSizeSqm: z.string().nullable(),
  status: parcelStatus,
  entity: z.object({ id, name: z.string(), archived: z.boolean() }),
  archivedAt: z.iso.datetime().nullable(),
  /** The first stage in catalog order that isn't granted; null when all are. */
  currentStage: stageSummary.nullable(),
  stagesGranted: z.number().int().min(0),
  stagesTotal: z.number().int().min(0),
  /** null when the viewer may not see the cost (costHidden); never sent to them. */
  acquisition: z
    .object({ cost: z.string().nullable(), currency: z.literal('NGN'), on: isoDate.nullable() })
    .nullable(),
  /** Tells "not recorded" (acquisition.cost null) from "not yours to see". */
  costHidden: z.boolean(),
  updatedAt: z.iso.datetime(),
})
export type ParcelRow = z.infer<typeof parcelRow>

export const listParcelsOutput = paginated(parcelRow).extend({
  /** Every non-archived parcel in the viewer's companies (and the switcher's), for the subtitle. */
  summary: z.object({ count: z.number().int().min(0), totalSqm: z.string() }),
})
export type ListParcelsOutput = z.infer<typeof listParcelsOutput>

const personName = z.object({ name: z.string() })

export const titleStage = z.object({
  id,
  type: titleStageType,
  status: titleStageStatus,
  /** null while not started, and for a stage granted from Add parcel without an issue date. */
  statusOn: isoDate.nullable(),
  reference: z.string().nullable(),
  issuedBy: z.string().nullable(),
  note: z.string().nullable(),
  followUpOn: isoDate.nullable(),
  version: z.number().int().min(1),
  updatedAt: z.iso.datetime(),
  updatedBy: personName.nullable(),
  /** The caller made the last update under 2 minutes ago: **Undo** is offered. */
  canUndo: z.boolean(),
})
export type TitleStage = z.infer<typeof titleStage>

export const documentVersion = z.object({
  id,
  versionNo: z.number().int().min(1),
  number: z.string().nullable(),
  issuedOn: isoDate.nullable(),
  issuedBy: z.string().nullable(),
  note: z.string().nullable(),
  uploadedAt: z.iso.datetime(),
  uploadedBy: personName,
  file: z.object({ name: z.string(), contentType: z.string(), sizeBytes: z.number().int() }),
  /** Removed with a reason: hidden from the vault, kept in the history. */
  removed: z.object({ at: z.iso.datetime(), byName: z.string(), reason: z.string() }).nullable(),
})
export type DocumentVersion = z.infer<typeof documentVersion>

export const titleDocument = z.object({
  id,
  type: titleDocumentType,
  name: z.string().nullable(),
  /** The stage it sits under: the type's stage, or the stage an `other` file was attached in. */
  stageType: titleStageType.nullable(),
  /** The newest version that isn't removed; null when every version is removed. */
  latest: documentVersion.nullable(),
  /** Versions before `latest` that aren't removed ("v2 · 2 earlier" counts removed ones out). */
  earlierCount: z.number().int().min(0),
})
export type TitleDocument = z.infer<typeof titleDocument>

export const parcelDetail = parcelRow.extend({
  /** "Bought from": null when not recorded, or when the viewer may not see it (sellerHidden). */
  seller: z.string().nullable(),
  /** Same rule as the cost (owner, 28 Nov 2026): Land & title edit or Finance view. */
  sellerHidden: z.boolean(),
  notes: z.string().nullable(),
  version: z.number().int().min(1),
  /** In catalog order. */
  stages: z.array(titleStage),
  /** Documents with a version in the vault, in catalog order then name. */
  documents: z.array(titleDocument),
  /** The issuer last used for each stage type on parcels in the same state. */
  suggestedIssuers: z.partialRecord(titleStageType, z.string()),
  can: z.object({ edit: z.boolean(), create: z.boolean(), delete: z.boolean() }),
  /** Why nothing can change: the parcel or its company is archived. */
  readOnly: z.enum(['archived', 'entity_archived']).nullable(),
})
export type ParcelDetail = z.infer<typeof parcelDetail>

export const timelineEvent = z.object({
  id,
  at: z.iso.datetime(),
  actor: auditActor,
  action: z.string(),
  /** Plain words without the parcel's name ("C of O granted", "Removed survey plan v2 · wrong parcel"). */
  what: z.string(),
  changes: z.array(auditFieldChange),
})
export type TimelineEvent = z.infer<typeof timelineEvent>

/** A new file attached in the stage sheet (needs Land & title create). */
export const stageAttachmentInput = z.strictObject({
  fileId: id,
  type: titleDocumentType,
  name: optionalText(80, 'the name'),
})

/**
 * One stage update. The fields replace the stage's (send the current reference to keep it).
 * Vault documents of the stage's type count for granted without being attached again.
 */
export const updateStageInput = z
  .strictObject({
    id,
    expectedVersion: z.number().int().min(1),
    status: stageUpdateStatus,
    on: isoDate,
    reference: optionalText(100, 'the reference'),
    issuedBy: optionalText(120, 'the issuer'),
    /** *What happened*: needed for queried, rejected, and leaving granted. */
    note: optionalNotes(1000),
    /** Kept only while submitted or queried. */
    followUpOn: isoDate.nullish(),
    attachments: z.array(stageAttachmentInput).max(5).default([]),
  })
  .superRefine((v, ctx) => {
    if (needsNote(v.status) && !v.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: noteRequiredMessage(v.status) })
    }
    v.attachments.forEach((a, i) => {
      checkDocumentName(a, ctx, ['attachments', i])
    })
  })
export type UpdateStageInput = z.input<typeof updateStageInput>

/** Undo the caller's own last update of this stage, within 2 minutes. */
export const undoStageInput = z.strictObject({ id, expectedVersion: z.number().int().min(1) })

/** Edit stages: the full list wanted; started or documented stages can't leave. */
export const setStagesInput = z.strictObject({
  parcelId: id,
  expectedVersion: z.number().int().min(1),
  types: uniqueStages,
})

export const uploadDocumentInput = z
  .strictObject({
    parcelId: id,
    type: titleDocumentType,
    name: optionalText(80, 'the name'),
    /** **Add as a separate document** (several receipts, agreements or deeds): needs a name. */
    separate: z.boolean().default(false),
    fileId: id,
    number: optionalText(100, 'the number'),
    issuedOn: isoDate.nullish(),
    issuedBy: optionalText(120, 'the issuer'),
    note: optionalNotes(1000),
  })
  .superRefine((v, ctx) => checkDocumentName(v, ctx, []))
export type UploadDocumentInput = z.input<typeof uploadDocumentInput>

export const uploadDocumentOutput = z.object({
  document: titleDocument,
  version: documentVersion,
})

export const documentVersionsInput = z.strictObject({ documentId: id })

export const removeVersionInput = z.strictObject({
  versionId: id,
  reason: z
    .string()
    .trim()
    .min(3, { message: 'Say why, e.g. wrong parcel' })
    .max(300, { message: 'Use 300 characters or fewer' })
    .refine((v) => !hasHiddenCharactersInText(v), { message: HIDDEN_CHARACTERS_IN_TEXT_MESSAGE }),
})

export const versionIdInput = z.strictObject({ versionId: id })

export const documentOutput = z.object({ document: titleDocument })

export const documentLinkInput = z.strictObject({
  versionId: id,
  /** inline: preview in the browser's own viewer; attachment: download. */
  disposition: z.enum(['inline', 'attachment']),
})

export const documentLinkOutput = z.object({ url: z.url(), expiresAt: z.iso.datetime() })

export const landHomeInput = z.strictObject({ entityId: id.optional() })

export const LAND_QUEUE_KINDS = ['query', 'follow_up', 'stalled'] as const

export const landQueueItem = z.object({
  kind: z.enum(LAND_QUEUE_KINDS),
  parcelId: id,
  parcelName: z.string(),
  stageId: id,
  stageType: titleStageType,
  /** Query: the query's date; follow-up: the follow-up date; stalled: the last movement. */
  due: isoDate,
  /** Days since `due` (Lagos), 0 today. */
  days: z.number().int(),
})
export type LandQueueItem = z.infer<typeof landQueueItem>

export const landHome = z.object({
  /** Any non-archived parcel in view; without one the tile says "Add your first parcel". */
  hasParcels: z.boolean(),
  titlesInProgress: z.object({
    count: z.number().int().min(0),
    /** Of those, parcels with a stage stalled over 90 days. */
    stalled: z.number().int().min(0),
    /** Per company, for the bar under *All companies*; companies with none are left out. */
    byEntity: z.array(z.object({ entityId: id, name: z.string(), count: z.number().int() })),
  }),
  /** Non-archived, non-titled parcels by current stage, in catalog order. */
  pipeline: z.array(
    z.object({
      stageType: titleStageType,
      count: z.number().int().min(1),
      /** Longest first, up to 5. */
      parcels: z.array(z.object({ id, name: z.string(), sinceDays: z.number().int() })),
    }),
  ),
  titledCount: z.number().int().min(0),
  /** Only for people who can edit Land & title; by due date, then impact; at most 20. */
  queue: z.array(landQueueItem),
})
export type LandHome = z.infer<typeof landHome>
