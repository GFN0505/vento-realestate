import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { logger } from '@/lib/logger'
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
      const result = await resetMemberTwoStep(serviceContext(context), input.memberId)
      await sendAll(context.mailer, result.emails)
      try {
        // Better Auth issues the 30-minute, single-use reset link and emails it.
        await context.auth.api.requestPasswordReset({
          body: { email: result.resetPasswordFor, redirectTo: '/reset-password' },
        })
      } catch (error) {
        // The reset is done; they can still use "Forgot password" to get a link.
        logger.error('Reset link after two-step reset not sent', {
          requestId: context.requestId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return { notice: result.notice }
    }),
}
