import { z } from 'zod'
import { notice } from '../account/schema'
import { requestOutcome } from '../approvals/outcome'
import { platform } from '../common/errors'
import { id } from '../common/schemas'
import { teamInvitationRow, teamMemberRow } from '../team/schema'
import {
  acceptInvitationAsNewUserInput,
  acceptInvitationOutput,
  createInvitationsInput,
  createRoleInput,
  invitationPreview,
  invitationTokenInput,
  memberIdInput,
  resendInvitationInput,
  role,
  roleDetail,
  roleList,
  updateMemberAccessInput,
  updateRoleInput,
  whoCanChangeAccessInput,
  whoCanChangeAccessOutput,
} from './schema'

const byId = z.strictObject({ id })

export const rolesContract = {
  /**
   * Every live role in one page (at most 59), built-ins in the default order, then custom A–Z.
   * Each says what the viewer may do with it.
   */
  list: platform.output(roleList),
  /** Archived (deleted) roles are NOT_FOUND. */
  get: platform.input(byId).output(roleDetail),
  /** A custom role copying the source's permissions and two-step value. */
  create: platform.input(createRoleInput).output(notice.extend({ role })),
  /**
   * `role.version` is the new version, for Undo. `outcome` (always sent) says whether it ran or
   * waits for approval; while it waits, `role` is unchanged.
   */
  update: platform
    .input(updateRoleInput)
    .output(notice.extend({ role, outcome: requestOutcome.optional() })),
  /** Erased, or archived when history refers to it. Refused while anyone holds it. */
  delete: platform.input(byId).output(notice),
}

// Listing people is team.list (one list with invitations, names limited to the viewer's access).
export const membersContract = {
  /**
   * The updated row, so the web replaces it in place. Undo calls this again with the old values.
   * `outcome` (always sent): making someone an owner may wait for approval, with `row` unchanged.
   */
  updateAccess: platform
    .input(updateMemberAccessInput)
    .output(notice.extend({ row: teamMemberRow, outcome: requestOutcome.optional() })),
  remove: platform.input(memberIdInput).output(notice),
  resetTwoStep: platform.input(memberIdInput).output(notice),
}

export const invitationsContract = {
  /**
   * All or nothing. Every clashing email comes back in the CONFLICT data. Owner invitations that
   * need approval aren't created yet: `requested` (always sent) names each with its request.
   */
  create: platform.input(createInvitationsInput).output(
    notice.extend({
      sent: z.number().int(),
      invitations: z.array(teamInvitationRow),
      requested: z.array(z.object({ email: z.string(), requestId: id })).optional(),
    }),
  ),
  /**
   * Once a minute per invitation (TOO_MANY_REQUESTS). Owner invitations: owners only, and they go
   * through the "Make someone an owner" rules: `outcome` (always sent) says whether it was sent or
   * waits for approval (BAD_REQUEST `reason_required` without `reason`, CONFLICT
   * `approval_pending` / `no_approver`). While it waits, the invitation stays as it is.
   */
  resend: platform
    .input(resendInvitationInput)
    .output(notice.extend({ outcome: requestOutcome.optional() })),
  withdraw: platform.input(z.strictObject({ id })).output(notice),
  /** Public: what the invitation offers, for the Accept invitation screen. */
  preview: platform.input(invitationTokenInput).output(invitationPreview),
  /** Signed in as the invited email. */
  accept: platform.input(invitationTokenInput).output(acceptInvitationOutput),
  /** Public: creates the account and signs in (sets the session cookie). */
  acceptAsNewUser: platform.input(acceptInvitationAsNewUserInput).output(acceptInvitationOutput),
  /** Public. */
  decline: platform.input(invitationTokenInput).output(notice),
}

export const accessContract = {
  /** Any member: who can open a module and who to ask, for the 403 page. */
  whoCanChangeAccess: platform.input(whoCanChangeAccessInput).output(whoCanChangeAccessOutput),
}
