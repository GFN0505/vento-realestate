import { z } from 'zod'
import { pendingApproval } from '../approvals/outcome'
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
import { ENCUMBRANCE_STATUSES, ENCUMBRANCE_TYPES } from './encumbrance'
import { optionalNotes, optionalText } from './fields'
import { MAX_SIZE_SQM, SIZE_UNITS, sizeSqmDecimal } from './size'

export const parcelStatus = z.enum(PARCEL_STATUSES)
export const chosenParcelStatus = z.enum(CHOSEN_PARCEL_STATUSES)
export const sizeUnit = z.enum(SIZE_UNITS)
export const titleStageType = z.enum(TITLE_STAGE_TYPES)
export const titleStageStatus = z.enum(TITLE_STAGE_STATUSES)
export const stageUpdateStatus = z.enum(STAGE_UPDATE_STATUSES)
export const titleDocumentType = z.enum(TITLE_DOCUMENT_TYPES)
export const encumbranceType = z.enum(ENCUMBRANCE_TYPES)
export const encumbranceStatus = z.enum(ENCUMBRANCE_STATUSES)

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
  // abort: a size that isn't a number never reaches Decimal (which throws on "" or "4,2").
  .regex(SIZE_PATTERN, { message: 'Enter a size like 4.2 or 600', abort: true })
  .refine((v) => new Decimal(v).gt(0), { message: 'Enter a size above zero' })

const PLOT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/

const plotSize = z
  .string()
  .trim()
  .regex(PLOT_PATTERN, { message: 'Enter a plot size in m², like 600 or 648', abort: true })
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

/** `encumbered`: not archived, with any active encumbrance, blocking or not (owner, 28 Nov 2026). */
export const PARCEL_FILTERS = ['all', 'titled', 'in_progress', 'encumbered', 'archived'] as const
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
  /**
   * Active encumbrances only; null when there are none. `top` is the most serious (blocking
   * first, then severity), for the badge: "Court order", "Caveat + 1", "Mortgaged to …".
   */
  encumbrance: z
    .object({
      /** The sales block (decision 0027): any active one blocks sales. */
      blocked: z.boolean(),
      /** `claimant` is null for people who can't see encumbrance details (owner, 28 Nov 2026). */
      top: z.object({
        type: encumbranceType,
        blocksSales: z.boolean(),
        claimant: z.string().nullable(),
      }),
      count: z.number().int().min(1),
    })
    .nullable(),
  updatedAt: z.iso.datetime(),
})
export type ParcelRow = z.infer<typeof parcelRow>

export const listParcelsOutput = paginated(parcelRow).extend({
  /** Every non-archived parcel in the viewer's companies (and the switcher's), for the subtitle. */
  summary: z.object({
    count: z.number().int().min(0),
    totalSqm: z.string(),
    /** Of those, parcels whose sales are blocked (non-blocking mortgages don't count). */
    blocked: z.number().int().min(0),
  }),
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

/**
 * An encumbrance's evidence or clearance file: the version saved with it (security M1), whatever
 * the vault holds now, so what was approved is what shows.
 */
export const encumbranceFile = z.object({
  documentId: id,
  /** "Caveat · CV/LAG/2026/114". */
  name: z.string(),
  version: documentVersion,
})
export type EncumbranceFile = z.infer<typeof encumbranceFile>

export const encumbrance = z.object({
  id,
  type: encumbranceType,
  status: encumbranceStatus,
  blocksSales: z.boolean(),
  /**
   * Claimant, lawyer, notes and the files go only to people who can edit Land & title or approve
   * in it (owner, 28 Nov 2026); for others they're null and `detailsHidden` is true.
   */
  detailsHidden: z.boolean(),
  /** "Claimant or holder": personal data, never logged. */
  claimant: z.string().nullable(),
  servedOn: isoDate,
  reference: z.string().nullable(),
  lawyer: z.string().nullable(),
  /** A hearing (court order) or next date; may have passed without an update. */
  nextOn: isoDate.nullable(),
  notes: z.string().nullable(),
  version: z.number().int().min(1),
  recordedBy: personName,
  recordedAt: z.iso.datetime(),
  /** The evidence as recorded; null when hidden. */
  evidence: encumbranceFile.nullable(),
  clearance: z
    .object({
      clearedOn: isoDate,
      /** Null when there's none or it's hidden. */
      note: z.string().nullable(),
      clearedAt: z.iso.datetime(),
      /** The clearance evidence as approved; null when hidden. */
      file: encumbranceFile.nullable(),
      /** The approvers in step order, from the audit ("approved by Aisha Bello, Olumide Bankole"). */
      approvedBy: z.array(z.string()),
    })
    .nullable(),
  /** A clearing request waiting for approval; null otherwise. */
  pendingClear: pendingApproval.nullable(),
})
export type Encumbrance = z.infer<typeof encumbrance>

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
  /** The sales block (decision 0027): an active encumbrance on it blocks sales. */
  blocked: z.boolean(),
  /** Active first (most serious first), then cleared, newest first. */
  encumbrances: z.array(encumbrance),
  can: z.object({
    edit: z.boolean(),
    create: z.boolean(),
    delete: z.boolean(),
    /** Record an encumbrance (Land & title create). */
    record: z.boolean(),
    /** Edit and ask to clear one (edit, and create for the evidence upload). */
    clear: z.boolean(),
  }),
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

export const LAND_QUEUE_KINDS = ['query', 'follow_up', 'stalled', 'next_date'] as const
export const LAND_STAGE_QUEUE_KINDS = ['query', 'follow_up', 'stalled'] as const

const queueBase = {
  parcelId: id,
  parcelName: z.string(),
  /** Query: the query's date; follow-up: the follow-up date; stalled: the last movement. */
  due: isoDate,
  /** Days since `due` (Lagos), 0 today, negative while it's ahead (next dates). */
  days: z.number().int(),
}

/** A title stage to act on. */
export const landStageQueueItem = z.object({
  kind: z.enum(LAND_STAGE_QUEUE_KINDS),
  ...queueBase,
  stageId: id,
  stageType: titleStageType,
})
export type LandStageQueueItem = z.infer<typeof landStageQueueItem>

/**
 * An active encumbrance's hearing or next date within 30 days, or passed without an update
 * (owner, 28 Nov 2026). `due` is the date; `blocksSales` makes it a blocker.
 */
export const landNextDateQueueItem = z.object({
  kind: z.literal('next_date'),
  ...queueBase,
  encumbranceId: id,
  encumbranceType: encumbranceType,
  blocksSales: z.boolean(),
})
export type LandNextDateQueueItem = z.infer<typeof landNextDateQueueItem>

export const landQueueItem = z.discriminatedUnion('kind', [
  landStageQueueItem,
  landNextDateQueueItem,
])
export type LandQueueItem = z.infer<typeof landQueueItem>

/** One active encumbrance on the Land & legal home's panel. */
export const landHomeEncumbrance = z.object({
  id,
  parcelId: id,
  parcelName: z.string(),
  type: encumbranceType,
  blocksSales: z.boolean(),
  /** Null for people who can't see encumbrance details. */
  claimant: z.string().nullable(),
  /** The case or caveat number, which everyone who can view Land & title sees. */
  reference: z.string().nullable(),
  servedOn: isoDate,
  nextOn: isoDate.nullable(),
})

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
  /** The *Encumbrances blocking sales* tile and the *Encumbrances* panel. */
  encumbrances: z.object({
    /** Parcels whose sales are blocked. */
    blockedParcels: z.number().int().min(0),
    /** The oldest served date among blocking ones ("Oldest since 4 Nov 2026"). */
    oldestBlockingSince: isoDate.nullable(),
    /** Blocked parcels per company; companies with none are left out. */
    byEntity: z.array(z.object({ entityId: id, name: z.string(), count: z.number().int() })),
    /** Every active encumbrance in view, blocking or not ("See all {n}"). */
    activeCount: z.number().int().min(0),
    /** Blocking first, then by next date; at most 5. */
    active: z.array(landHomeEncumbrance),
  }),
  /** Only for people who can edit Land & title; by due date, then impact; at most 20. */
  queue: z.array(landQueueItem),
})
export type LandHome = z.infer<typeof landHome>

export const landBlockersInput = z.strictObject({ entityId: id.optional() })

/** One blocked parcel for the executive home's *Needs attention*. */
export const landBlocker = z.object({
  parcelId: id,
  parcelName: z.string(),
  /** The most serious blocking encumbrance. */
  type: encumbranceType,
  reference: z.string().nullable(),
  /** Other active encumbrances on the parcel ("and 1 more"). */
  others: z.number().int().min(0),
  /** When the oldest blocking one was served or lodged. */
  since: isoDate,
})
export type LandBlocker = z.infer<typeof landBlocker>

export const landBlockers = z.object({
  /** Oldest first; at most 10. */
  items: z.array(landBlocker),
  total: z.number().int().min(0),
})
export type LandBlockers = z.infer<typeof landBlockers>
