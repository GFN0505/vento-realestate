import { oc } from '@orpc/contract'
import { z } from 'zod'
import { PASSWORD_ERROR_CODES } from '../auth/error-codes'
import { type FeatureKey, LIMIT_KEYS } from '../features/catalog'
import { id } from './schemas'

/** Why a request has no signed-in person. `session_expired` opens the "Session expired" dialog. */
export const unauthorizedReason = z.enum(['signed_out', 'session_expired'])
export type UnauthorizedReason = z.infer<typeof unauthorizedReason>

export const badRequestReason = z.enum([
  ...PASSWORD_ERROR_CODES,
  'role_needs_two_step',
  /** "Confirm it's you" with the wrong password. */
  'wrong_password',
  /** The console's "Confirm it's you" with a wrong code or backup code (counts towards the lock). */
  'wrong_code',
  /** The console's "Confirm it's you" with a passkey that didn't verify (never counts). */
  'passkey_failed',
  /** An action a rule sends for approval, sent without a reason ("Tell the approver why."). */
  'reason_required',
  /** Reject without a comment the server caught (zod catches it first in the web). */
  'comment_required',
  /** An upload that isn't one of the purpose's file types (declared at start, sniffed at the end). */
  'file_type',
  /** An upload over the purpose's size limit. */
  'file_too_large',
  /** Completing an upload with parts missing, mismatched or a size other than declared. */
  'upload_incomplete',
  /** A file id a record can't use: not this person's, not finished, or already used elsewhere. */
  'file_unavailable',
  /** An LGA that isn't in the parcel's state ("Pick an LGA in Lagos."). */
  'lga_not_in_state',
  /** A date after today in Lagos ("Enter a date on or before today."). */
  'future_date',
  /** Granted without a document of the stage's type in the sheet or the vault. */
  'granted_needs_document',
  /** *What happened* is needed: queried, rejected, or leaving granted. */
  'note_required',
  /** Cleared before it was served ("Enter a date on or after 4 Nov 2026."). */
  'cleared_before_served',
  /** Upload document with type encumbrance evidence: those come from the encumbrance sheets. */
  'evidence_from_encumbrance',
  /** A next date more than a year before the date served or more than 10 years ahead. */
  'next_on_out_of_range',
])
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
  /** A Vento Real Estate staff account can't create or join an organization (decision 0023). */
  'staff_account',
  /** Deciding a step of your own approval request, whatever your role. */
  'own_request',
  /**
   * Seeing the request but not eligible to decide its current step: the role isn't in the step,
   * has no Approve in the module, company access doesn't cover it, decided an earlier step, or the
   * action excludes this person. The message says which.
   */
  'not_eligible',
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
  /** A Vento Real Estate console change the platform operation refused; `message` is its own sentence. */
  'platform_refused',
  /** The console change was previewed against a state that has since moved; `changedByName` says who. */
  'platform_stale',
  /**
   * Customer invite or resend to an email that is a Vento Real Estate staff account, or accepting
   * a customer invitation with one; `staffAccounts` lists the emails on invite.
   */
  'staff_account',
  /** Staff sign-up: the invited email got a customer account after the invitation was sent. */
  'staff_customer_account',
  /** A pending approval request for this record and action exists; `requestId` opens it. */
  'approval_pending',
  /** The request passed its 7 days; it now reads expired. */
  'approval_expired',
  /** The record changed after the request was made, so it expired instead of running. */
  'approval_stale',
  /** Someone decided this step a moment ago; `changedByName` says who. */
  'approval_decided',
  /** The request is no longer pending (approved, rejected, cancelled or expired). */
  'approval_not_pending',
  /** A money action with nobody else eligible to approve: refused before anything is saved. */
  'no_approver',
  /** Another approval rule already covers this action, amount and company scope. */
  'approval_rule_exists',
  /** Someone saved or deleted the rule since it was loaded; `changedByName` says who. */
  'approval_rule_changed',
  /** The role is named in approval rules; `count` says how many. */
  'role_in_rule',
  /** An export over the row cap; `count` is how many rows the filters match. */
  'too_many_rows',
  /** Someone saved the record since it was loaded; `changedByName` says who (land). */
  'stale',
  /** The parcel is archived: read-only until restored. */
  'parcel_archived',
  /** Edit stages: a stage that has started or has documents stays. */
  'stage_started',
  /** Removing the only file behind a granted stage. */
  'evidence_for_granted',
  /** Undo after 2 minutes, by someone else, or after a later change: it's a new update now. */
  'undo_expired',
  /** **Add as a separate document** with a name this type already uses on the parcel. */
  'document_name_taken',
  /** The parcel's vault is full (200 documents); new versions of existing ones still go in. */
  'too_many_documents',
  /**
   * An action that refuses without a rule (decision 0026) found none for the record's company:
   * "Clearing an encumbrance needs an approval rule…".
   */
  'no_rule',
  /** Archiving a parcel with an active encumbrance ("Clear the caveat before archiving …"). */
  'encumbered',
  /** Editing an encumbrance while a request to clear it waits. */
  'clearing_pending',
  /** The encumbrance is cleared: frozen, nothing changes it. */
  'encumbrance_cleared',
  /** Removing the only kept version of an encumbrance's evidence or clearance. */
  'evidence_for_encumbrance',
  /**
   * A new sale on a parcel an active encumbrance blocks (decision 0027): "Court order
   * FHC/L/CS/1182/2026 blocks new sales on Plot 22, Folu Ayo." Raised for Projects and Sales.
   */
  'sales_blocked',
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
    /**
     * Only ever set for an active super-admin, so the console can open "Confirm it's you" or
     * the two-step set-up in one round trip. Everyone else gets no data.
     */
    data: z
      .object({ reason: z.enum(['console_window_closed', 'console_two_step_required']) })
      .optional(),
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
      /** `role_changed` / `platform_stale` / `stale`: who saved it last, e.g. "Aisha Bello". */
      changedByName: z.string().optional(),
      /** `role_in_use`: active members and open invitations holding the role. */
      holders: z
        .object({ members: z.number().int().min(0), invited: z.number().int().min(0) })
        .optional(),
      /** `staff_account` on invitations.create: every email that is a staff account. */
      staffAccounts: z.array(z.string()).optional(),
      /**
       * `platform_refused`: the console's next step, e.g. an **End trial** link, or **Resend** on
       * the staff invitation already open for that email (`invitationId`).
       */
      next: z.enum(['end_trial', 'change_ai_budget', 'resend_invitation']).optional(),
      invitationId: id.optional(),
      /** `approval_pending`: the request already waiting for this record and action. */
      requestId: id.optional(),
      /** `role_in_rule`: rules naming the role; `too_many_rows`: rows matching the filters. */
      count: z.number().int().min(0).optional(),
    }),
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    message: 'Too many attempts. Wait a minute and try again.',
    data: z.object({
      retryAfterSeconds: z.number().int().min(1),
      /** `uploads_in_progress`: 20 unfinished uploads already; finish or cancel one first. */
      reason: z.enum(['uploads_in_progress']).optional(),
    }),
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

/** The data of a NOT_FOUND error; only the Vento Real Estate console sends any. */
export type NotFoundData = z.infer<(typeof errorMap)['NOT_FOUND']['data']>

/**
 * Procedure metadata (decision 0016). `feature` is the catalog key the procedure belongs to, or
 * null for platform procedures with no flag. The server gates on it; a test checks every
 * procedure declares it. `area: 'console'` marks console procedures (decision 0021), and
 * only those: a walk test checks both directions.
 */
export type ProcedureMeta = { feature?: FeatureKey | null; area?: 'console' }

/** Base contract builder: the shared error map, no feature declared. Use `platform` or `forFeature`. */
export const base = oc.$meta<ProcedureMeta>({}).errors(errorMap)

/** Platform procedures: no flag, in every plan (accounts, organization, team, access). */
export const platform = base.meta({ feature: null })

/** Module procedures: `const sales = forFeature('sales')`, then `sales.input(…).output(…)`. */
export const forFeature = (feature: FeatureKey) => base.meta({ feature })
