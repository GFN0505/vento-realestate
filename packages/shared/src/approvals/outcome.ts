import { z } from 'zod'
import { id } from '../common/schemas'
import { APPROVAL_COPY } from './copy'

// Apart from schema.ts so access/schema.ts can use them without an import cycle.

export const APPROVAL_TEXT_MAX = 500

/**
 * The maker's **Why?**, sent with a guarded action. Optional in each module's input: the service
 * asks for it (BAD_REQUEST `reason_required`) only when a rule applies.
 */
export const approvalReason = z
  .string()
  .trim()
  .min(1, { message: APPROVAL_COPY.reasonRequired })
  .max(APPROVAL_TEXT_MAX, { message: `Keep it under ${APPROVAL_TEXT_MAX} characters` })

/** What a guarded action's mutation returns: it ran, or a request now waits. */
export const requestOutcome = z.discriminatedUnion('ran', [
  z.object({ ran: z.literal(true), notice: z.string() }),
  z.object({ ran: z.literal(false), requestId: id, notice: z.string() }),
])
export type RequestOutcome = z.infer<typeof requestOutcome>

/**
 * The record's "Waiting for approval" status, embedded by modules that guard an action (the role
 * page, a Team row). Null when nothing waits.
 */
export const pendingApproval = z.object({
  requestId: id,
  /** "Finance", "Owner or Admin": the current step's roles. */
  waitingFor: z.string(),
  requestedAt: z.iso.datetime(),
  /** The viewer made it, so **Cancel request** shows. */
  isOwn: z.boolean(),
})
export type PendingApproval = z.infer<typeof pendingApproval>
