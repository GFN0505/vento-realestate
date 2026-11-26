import { z } from 'zod'
import { notice } from '../account/schema'
import { platform } from '../common/errors'
import { id, paginated } from '../common/schemas'
import {
  acceptInvitationAsNewUserInput,
  acceptInvitationOutput,
  createInvitationsInput,
  invitation,
  invitationPreview,
  invitationTokenInput,
  listInvitationsInput,
  listMembersInput,
  member,
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

export const membersContract = {
  list: platform.input(listMembersInput).output(paginated(member)),
  updateAccess: platform.input(updateMemberAccessInput).output(notice.extend({ member })),
  remove: platform.input(memberIdInput).output(notice),
  resetTwoStep: platform.input(memberIdInput).output(notice),
}

export const invitationsContract = {
  list: platform.input(listInvitationsInput).output(paginated(invitation)),
  create: platform.input(createInvitationsInput).output(notice.extend({ sent: z.number().int() })),
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
