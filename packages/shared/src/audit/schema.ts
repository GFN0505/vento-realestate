import { z } from 'zod'
import { id, isoDate, paginated, paginationInput } from '../common/schemas'
import { AUDIT_MODULES } from './labels'

const datetime = z.iso.datetime()

/** At most a year per search or export (plan question 8), so every query uses the date index. */
export const AUDIT_MAX_RANGE_DAYS = 366
/** Default window when the address has no dates. */
export const AUDIT_DEFAULT_RANGE_DAYS = 7
/** Above this the export is refused with the count (CONFLICT `too_many_rows`). */
export const AUDIT_EXPORT_MAX_ROWS = 50_000

export const auditModule = z.enum(AUDIT_MODULES)

const DAY_MS = 86_400_000

/** Whole days from `from` to `to` (both calendar dates, no time). */
function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
}

const filterFields = {
  /** Person, record name or number, or words in the entry. */
  q: z.string().trim().max(100).optional(),
  module: auditModule.optional(),
  actorUserId: id.optional(),
  /** A company: its own events and events whose metadata names it. */
  entityId: id.optional(),
  /** Inclusive calendar dates in Lagos time (the server turns them into a UTC range). */
  from: isoDate,
  to: isoDate,
  /** **View history** on a role or member: the record's own entries. */
  targetType: z.enum(['role', 'member', 'user', 'entity', 'invitation', 'organization']).optional(),
  targetId: id.optional(),
}

type RangeShape = { from: string; to: string }

function checkRange(v: RangeShape, ctx: z.RefinementCtx): void {
  const days = daysBetween(v.from, v.to)
  if (days < 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'Choose an end date after the start date',
    })
  } else if (days > AUDIT_MAX_RANGE_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['from'], message: 'Choose dates up to a year apart' })
  }
}

export const auditFilters = z.strictObject(filterFields).superRefine(checkRange)
export type AuditFilters = z.input<typeof auditFilters>

export const listAuditInput = z
  .strictObject({ ...paginationInput.shape, ...filterFields })
  .superRefine(checkRange)
export type ListAuditInput = z.input<typeof listAuditInput>

/**
 * "Vento Real Estate" for Vento Real Estate's changes (its staff are never named), "System" for
 * jobs, otherwise a person. `other_organization`: an account event done by someone who isn't a
 * member here (an admin of another organization the person belongs to), shown as
 * OTHER_ORGANIZATION_ACTOR with no id, device or IP address (security L1).
 */
export const auditActor = z.object({
  userId: id.nullable(),
  name: z.string(),
  kind: z.enum(['person', 'vento', 'system', 'other_organization']),
})

export const auditFieldChange = z.object({
  label: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
})

export const auditRow = z.object({
  id,
  at: datetime,
  actor: auditActor,
  module: auditModule,
  /** Plain words: "Changed role Site engineer". */
  what: z.string(),
  /** Field by field; unlabelled fields collapse into "Other details changed". */
  changes: z.array(auditFieldChange),
  /** "Chrome on Mac"; null for system changes or when unknown. */
  device: z.string().nullable(),
  /** "102.89.34.x"; never a full address. */
  ipMasked: z.string().nullable(),
})
export type AuditRow = z.infer<typeof auditRow>

export const listAuditOutput = paginated(auditRow)

/**
 * The Person filter's choices: everyone who did something in the log in these dates, removed
 * members included, A–Z. Never anyone outside the organization.
 */
export const auditPeopleInput = z
  .strictObject({
    ...paginationInput.shape,
    /** Part of a name. */
    q: z.string().trim().max(100).optional(),
    from: isoDate,
    to: isoDate,
  })
  .superRefine(checkRange)
export type AuditPeopleInput = z.input<typeof auditPeopleInput>

export const auditPerson = z.object({
  userId: id,
  /** Their name now. */
  name: z.string(),
  /** No longer a member. */
  removed: z.boolean(),
})
export type AuditPerson = z.infer<typeof auditPerson>

export const auditPeopleOutput = paginated(auditPerson)

export const auditDetail = auditRow.extend({
  /** The record, with an app path when it has a page. */
  record: z.object({ label: z.string(), link: z.string().nullable() }).nullable(),
  /** The approvals behind the change, in step order. */
  approvedBy: z.array(z.object({ name: z.string(), position: z.number().int().min(1) })),
  /** A guarded action that went ahead because nobody else could approve it. */
  noApprover: z.boolean(),
  /** The approval request behind it, for a link to its detail. */
  approvalRequestId: id.nullable(),
})
export type AuditDetail = z.infer<typeof auditDetail>
