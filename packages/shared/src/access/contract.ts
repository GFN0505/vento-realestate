import { z } from 'zod'
import { notice } from '../account/schema'
import { platform } from '../common/errors'
import { id, paginated } from '../common/schemas'
import { teamInvitationRow, teamMemberRow } from '../team/schema'
import {
  acceptInvitationAsNewUserInput,
  acceptInvitationOutput,
  createInvitationsInput,
  invitationPreview,
  invitationTokenInput,
  memberIdInput,
  role,
  updateMemberAccessInput,
  whoCanChangeAccessInput,
  whoCanChangeAccessOutput,
} from './schema'

export const rolesContract = {
  /** At most a few dozen roles, still in the shared list shape. */
  list: platform.output(paginated(role)),
}

// Listing people is team.list (one list with invitations, names limited to the viewer's access).
export const membersContract = {
  /** The updated row, so the web replaces it in place. Undo calls this again with the old values. */
  updateAccess: platform
    .input(updateMemberAccessInput)
    .output(notice.extend({ row: teamMemberRow })),
  remove: platform.input(memberIdInput).output(notice),
  resetTwoStep: platform.input(memberIdInput).output(notice),
}

export const invitationsContract = {
  /** All or nothing. Every clashing email comes back in the CONFLICT data. */
  create: platform
    .input(createInvitationsInput)
    .output(notice.extend({ sent: z.number().int(), invitations: z.array(teamInvitationRow) })),
  /** Once a minute per invitation (TOO_MANY_REQUESTS). Owner invitations: owners only. */
  resend: platform.input(z.strictObject({ id })).output(notice),
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
