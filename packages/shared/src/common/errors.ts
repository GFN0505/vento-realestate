import { oc } from '@orpc/contract'
import { z } from 'zod'
import { PASSWORD_ERROR_CODES } from '../auth/error-codes'
import { type FeatureKey, LIMIT_KEYS } from '../features/catalog'
import { id } from './schemas'

/** Why a request has no signed-in person. `session_expired` opens the "Session expired" dialog. */
export const unauthorizedReason = z.enum(['signed_out', 'session_expired'])
export type UnauthorizedReason = z.infer<typeof unauthorizedReason>

export const badRequestReason = z.enum([...PASSWORD_ERROR_CODES, 'role_needs_two_step'])
export type BadRequestReason = z.infer<typeof badRequestReason>

export const forbiddenReason = z.enum([
  'permission',
  'two_step_setup_required',
  'own_access',
  'owner_only',
  'invitation_email_mismatch',
  /** A granter limited to some entities can only give access within them. */
  'entity_limit',
  /** A create would go over the plan's limit (projects, entities, people). */
  'plan_limit',
  /** The target role, person or invitation can do things the viewer can't (permission ceiling). */
  'wider_permissions',
  /** Organization-wide changes need access to every company. */
  'all_entities_required',
  /** Built-in roles never change. */
  'built_in_role',
  /** Nobody edits or deletes the role they hold. */
  'own_role',
  /** The caller's own membership or role changed during the request: reload to continue. */
  'access_changed',
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
  /** An archived entity of this organization was chosen for access; choose again. */
  'entity_unavailable',
  /** Another live role already has this name (any case, built-ins included). */
  'role_name_taken',
  /** Someone saved the role since it was loaded; `changedByName` says who. */
  'role_changed',
  /** Active members or open invitations hold the role; `holders` has the counts. */
  'role_in_use',
  /** The chosen role was deleted meanwhile; choose another. */
  'role_unavailable',
  /** 50 custom roles already. */
  'role_limit',
  /** The entity is archived; restore it to make changes. */
  'entity_archived',
  /** Restore of an entity that is already active. */
  'not_restorable',
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
  /**
   * Password rules checked on the server (reuse, or length and number where zod didn't run), and
   * `role_needs_two_step`: a role that can manage money, payroll or access sent without two-step.
   */
  BAD_REQUEST: {
    status: 400,
    message: 'Check the highlighted fields',
    data: z.object({ reason: badRequestReason }),
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
      /** `plan_limit` only: which limit, and how many the plan includes. */
      limit: z.enum(LIMIT_KEYS).optional(),
      included: z.number().int().optional(),
    }),
  },
  NOT_FOUND: {
    status: 404,
    message: "We couldn't find that. It may have been removed.",
  },
  CONFLICT: {
    status: 409,
    message: 'That conflicts with something that already exists',
    data: z.object({
      reason: conflictReason,
      /**
       * `already_member` / `already_invited` on invitations.create: every clashing email, so the
       * invite sheet marks each row at once. `already_member` wins when both kinds clash.
       */
      alreadyMembers: z.array(z.string()).optional(),
      alreadyInvited: z.array(z.object({ email: z.string(), id })).optional(),
      /**
       * `rc_number_taken`: the company already using the RC number, for "Restore it instead"
       * when it's archived. Only companies within the viewer's access are named.
       */
      entity: z.object({ id, name: z.string(), archived: z.boolean() }).optional(),
      /** `role_changed`: who saved the role last, e.g. "Aisha Bello". */
      changedByName: z.string().optional(),
      /** `role_in_use`: active members and open invitations holding the role. */
      holders: z
        .object({ members: z.number().int().min(0), invited: z.number().int().min(0) })
        .optional(),
    }),
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

/** The data of a FORBIDDEN error, e.g. `{ reason: 'plan_limit', limit: 'entities', included: 2 }`. */
export type ForbiddenData = z.infer<(typeof errorMap)['FORBIDDEN']['data']>

/** The data of a CONFLICT error, e.g. `{ reason: 'already_invited', alreadyInvited: [...] }`. */
export type ConflictData = z.infer<(typeof errorMap)['CONFLICT']['data']>

/**
 * Procedure metadata (decision 0016). `feature` is the catalog key the procedure belongs to, or
 * null for platform procedures with no flag. The server gates on it; a test checks every
 * procedure declares it.
 */
export type ProcedureMeta = { feature?: FeatureKey | null }

/** Base contract builder: the shared error map, no feature declared. Use `platform` or `forFeature`. */
export const base = oc.$meta<ProcedureMeta>({}).errors(errorMap)

/** Platform procedures: no flag, in every plan (accounts, organization, team, access). */
export const platform = base.meta({ feature: null })

/** Module procedures: `const sales = forFeature('sales')`, then `sales.input(…).output(…)`. */
export const forFeature = (feature: FeatureKey) => base.meta({ feature })
