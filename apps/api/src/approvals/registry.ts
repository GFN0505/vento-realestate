import type { ApprovalActionKey } from '@vento/shared'
import { ownerInvitationPlugin } from '@/modules/invitations/approvals'
import { makeOwnerPlugin } from '@/modules/members/approvals'
import { roleUpdatePlugin } from '@/modules/roles/approvals'
import { type RegisteredPlugin, registerPlugin } from './plugin'

/**
 * Every approvable action's plug-in, by catalog key. The type makes a missing key a compile
 * error; registry.test.ts checks each plug-in claims its own key and has a service test.
 */
export function approvalPlugins(): Readonly<Record<ApprovalActionKey, RegisteredPlugin>> {
  return {
    'access.role.update': registerPlugin(roleUpdatePlugin),
    'access.member.make_owner': registerPlugin(makeOwnerPlugin),
    'access.invitation.owner': registerPlugin(ownerInvitationPlugin),
  }
}
