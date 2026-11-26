import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { errorSummary } from '@/lib/error-summary'
import { logger } from '@/lib/logger'
import { member } from '@/orpc'
import { removeMember, resetMemberTwoStep, updateMemberAccess } from './members.service'

// Listing people is team.list.
export const membersRouter = {
  updateAccess: member.members.updateAccess
    .use(requirePermission('settings', 'edit', "change people's access"))
    .handler(async ({ context, input }) => {
      const { emails, ...result } = await updateMemberAccess(serviceContext(context), input)
      // "X is now an owner" to every owner, after commit.
      await sendAll(context.mailer, emails)
      return result
    }),
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
          ...errorSummary(error),
        })
      }
      return { notice: result.notice }
    }),
}
