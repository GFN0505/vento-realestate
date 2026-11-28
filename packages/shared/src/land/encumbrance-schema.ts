import { z } from 'zod'
import { approvalReason } from '../approvals/outcome'
import { id, isoDate } from '../common/schemas'
import { HIDDEN_CHARACTERS_MESSAGE, hasHiddenCharacters } from '../common/text'
import {
  alwaysBlocks,
  EARLIEST_SERVED_ON,
  ENCUMBRANCE_WORDS,
  type EncumbranceType,
  NEXT_ON_YEARS_BEFORE_SERVED,
  nextOnBounds,
} from './encumbrance'
import { optionalNotes, optionalText } from './fields'
import { encumbranceType, parcelDetail } from './schema'

// Encumbrance inputs (plan §4). Strict objects: status, type or blocksSales sent where they
// can't change is BAD_REQUEST, so only the approval's execute ever sets `cleared`.

export const EVIDENCE_REQUIRED = 'Attach the court order, caveat or other evidence.'
export const CLEARANCE_EVIDENCE_REQUIRED =
  'Attach the evidence of clearance, e.g. the withdrawal or discharge.'

/** "A court order always blocks sales." */
export function alwaysBlocksMessage(type: EncumbranceType): string {
  const word = ENCUMBRANCE_WORDS[type]
  return `A${/^[aeiou]/.test(word) ? 'n' : ''} ${word} always blocks sales.`
}

const claimant = z
  .string()
  .trim()
  .min(2, { message: 'Enter who holds the claim, e.g. Ogunleye family' })
  .max(200, { message: 'Use 200 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

/** A date from 1900 on (security L6); "not in the future" is checked on the server, in Lagos. */
const pastDate = isoDate.refine((v) => v >= EARLIEST_SERVED_ON, {
  message: 'Enter a date from 1900 onwards',
})

export const NEXT_ON_TOO_EARLY = `Enter a date no more than ${NEXT_ON_YEARS_BEFORE_SERVED} year before the date served`
export const NEXT_ON_TOO_LATE = 'Enter a date within the next 10 years'

/**
 * The next date's bounds (security L6): from a year before it was served to ten years after today.
 * Null when it's fine; the server checks with Lagos's today.
 */
export function nextOnProblem(nextOn: string, servedOn: string, today: string): string | null {
  const { min, max } = nextOnBounds(servedOn, today)
  if (nextOn < min) return NEXT_ON_TOO_EARLY
  if (nextOn > max) return NEXT_ON_TOO_LATE
  return null
}

/** One finished upload; a missing one reads as the field's own message. */
const evidenceFile = (message: string) => z.strictObject({ fileId: id }, { error: () => message })

const detailFields = {
  /** "Claimant or holder". */
  claimant,
  /** "Date served or lodged": on or before today in Lagos (checked on the server). */
  servedOn: pastDate,
  /** Suit number, caveat number. */
  reference: optionalText(100, 'the reference'),
  lawyer: optionalText(120, 'the lawyer'),
  /** A hearing or next date: may be ahead or (not yet updated) passed, within nextOnBounds. */
  nextOn: isoDate.nullish(),
  notes: optionalNotes(2000),
}

export const recordEncumbranceInput = z
  .strictObject({
    parcelId: id,
    type: encumbranceType,
    /** Locked on except for a mortgage; fixed once saved. */
    blocksSales: z.boolean(),
    ...detailFields,
    evidence: evidenceFile(EVIDENCE_REQUIRED),
  })
  .superRefine((v, ctx) => {
    if (alwaysBlocks(v.type) && !v.blocksSales) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocksSales'],
        message: alwaysBlocksMessage(v.type),
      })
    }
    // The upper bound needs Lagos's today, so the server checks it (nextOnProblem).
    if (v.nextOn && v.nextOn < nextOnBounds(v.servedOn, v.servedOn).min) {
      ctx.addIssue({ code: 'custom', path: ['nextOn'], message: NEXT_ON_TOO_EARLY })
    }
  })
export type RecordEncumbranceInput = z.input<typeof recordEncumbranceInput>

/**
 * Only the fields sent change. `expectedVersion` is the encumbrance's `version` as loaded; a
 * change in between answers CONFLICT `stale` with who saved it.
 */
export const updateEncumbranceInput = z
  .strictObject(detailFields)
  .partial()
  .extend({ id, expectedVersion: z.number().int().min(1) })
export type UpdateEncumbranceInput = z.input<typeof updateEncumbranceInput>

export const requestClearInput = z.strictObject({
  id,
  expectedVersion: z.number().int().min(1),
  /** On or after the date served, on or before today (checked on the server). */
  clearedOn: pastDate,
  evidence: evidenceFile(CLEARANCE_EVIDENCE_REQUIRED),
  /** "Recorded in error", or what ended it. */
  note: optionalNotes(1000),
  /** The send sheet's **Why?** (the engine asks for it when a rule applies, which is always). */
  reason: approvalReason.optional(),
})
export type RequestClearInput = z.input<typeof requestClearInput>

export const requestClearOutput = z.object({
  parcel: parcelDetail,
  /** The engine's notice: "Sent to Aisha Bello for approval". */
  notice: z.string(),
  /** The request now waiting; null when it ran (never, while a rule is required). */
  pendingRequestId: id.nullable(),
})
export type RequestClearOutput = z.infer<typeof requestClearOutput>
