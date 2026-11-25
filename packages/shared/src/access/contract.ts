import { z } from 'zod'
import { notice } from '../account/schema'
import { base } from '../common/errors'
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
} from './schema'

export const rolesContract = {
  /** At most a few dozen roles, still in the shared list shape. */
  list: base.output(paginated(role)),
}

export const membersContract = {
  list: base.input(listMembersInput).output(paginated(member)),
  updateAccess: base.input(updateMemberAccessInput).output(notice.extend({ member })),
  remove: base.input(memberIdInput).output(notice),
  resetTwoStep: base.input(memberIdInput).output(notice),
}

export const invitationsContract = {
  list: base.input(listInvitationsInput).output(paginated(invitation)),
  create: base.input(createInvitationsInput).output(notice.extend({ sent: z.number().int() })),
  resend: base.input(z.strictObject({ id })).output(notice),
  withdraw: base.input(z.strictObject({ id })).output(notice),
  /** Public: what the invitation offers, for the Accept invitation screen. */
  preview: base.input(invitationTokenInput).output(invitationPreview),
  /** Signed in as the invited email. */
  accept: base.input(invitationTokenInput).output(acceptInvitationOutput),
  /** Public: creates the account and signs in (sets the session cookie). */
  acceptAsNewUser: base.input(acceptInvitationAsNewUserInput).output(acceptInvitationOutput),
  /** Public. */
  decline: base.input(invitationTokenInput).output(notice),
}
