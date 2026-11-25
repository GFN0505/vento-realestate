import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { member } from '@/orpc'
import {
  listMembers,
  removeMember,
  resetMemberTwoStep,
  updateMemberAccess,
} from './members.service'

export const membersRouter = {
  list: member.members.list
    .use(requirePermission('settings', 'view', 'see the team'))
    .handler(({ context, input }) => listMembers(serviceContext(context), input)),
  updateAccess: member.members.updateAccess
    .use(requirePermission('settings', 'edit', "change people's access"))
    .handler(({ context, input }) => updateMemberAccess(serviceContext(context), input)),
  remove: member.members.remove
    .use(requirePermission('settings', 'delete', 'remove people'))
    .handler(({ context, input }) => removeMember(serviceContext(context), input.memberId)),
  resetTwoStep: member.members.resetTwoStep
    .use(requirePermission('settings', 'edit', "reset someone's two-step"))
    .handler(async ({ context, input }) => {
      const { notice, emails } = await resetMemberTwoStep(serviceContext(context), input.memberId)
      await sendAll(context.mailer, emails)
      return { notice }
    }),
}
