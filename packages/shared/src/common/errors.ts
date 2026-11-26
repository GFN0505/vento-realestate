import { oc } from '@orpc/contract'
import { z } from 'zod'
import { PASSWORD_ERROR_CODES } from '../auth/error-codes'

/** Why a request has no signed-in person. `session_expired` opens the "Session expired" dialog. */
export const unauthorizedReason = z.enum(['signed_out', 'session_expired'])
export type UnauthorizedReason = z.infer<typeof unauthorizedReason>

export const forbiddenReason = z.enum([
  'permission',
  'two_step_setup_required',
  'own_access',
  'owner_only',
  'invitation_email_mismatch',
  /** A granter limited to some entities can only give access within them. */
  'entity_limit',
])
export type ForbiddenReason = z.infer<typeof forbiddenReason>

export const conflictReason = z.enum([
  'rc_number_taken',
  'last_owner',
  'last_entity',
  'already_member',
  'already_invited',
  'already_onboarded',
  'invitation_expired',
  'invitation_withdrawn',
  'invitation_not_pending',
  'account_exists',
  'not_archivable',
  /**
   * The tab names a different organization than the session (decision 0013). The web never
   * shows the message; it reloads into the session's organization with a notice.
   */
  'organization_changed',
])
export type ConflictReason = z.infer<typeof conflictReason>

/**
 * Errors every procedure may return. `message` is always end-user copy from the spec;
 * `data.reason` lets the web choose a screen or state without parsing the message.
 */
export const errorMap = {
  /** Password rules checked on the server (reuse, or length and number where zod didn't run). */
  BAD_REQUEST: {
    status: 400,
    message: 'Check the highlighted fields',
    data: z.object({ reason: z.enum(PASSWORD_ERROR_CODES) }),
  },
  UNAUTHORIZED: {
    status: 401,
    message: 'Please sign in',
    data: z.object({ reason: unauthorizedReason }),
  },
  FORBIDDEN: {
    status: 403,
    message: "You don't have access to this",
    data: z.object({
      reason: forbiddenReason,
      /** Who to ask, e.g. "Olumide Bankole". Only for `permission`. */
      askName: z.string().optional(),
      /** That person's role, e.g. "owner". */
      askRole: z.string().optional(),
    }),
  },
  NOT_FOUND: {
    status: 404,
    message: "We couldn't find that. It may have been removed.",
  },
  CONFLICT: {
    status: 409,
    message: 'That conflicts with something that already exists',
    data: z.object({ reason: conflictReason }),
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    message: 'Too many attempts. Wait a minute and try again.',
    data: z.object({ retryAfterSeconds: z.number().int().min(1) }),
  },
  /** Anything unexpected. `reference` is in the server log line too, so support can find it. */
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: 'Something went wrong on our side',
    data: z.object({ reference: z.string() }),
  },
} as const

/** Base contract builder: every procedure declares the shared error map. */
export const base = oc.errors(errorMap)
