import { publicRateLimit, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { errorSummary } from '@/lib/error-summary'
import { logger } from '@/lib/logger'
import { requestScope } from '@/lib/request-scope'
import { authed, member, os } from '@/orpc'
import { deliverInvitations } from './delivery'
import {
  acceptInvitation,
  acceptInvitationAsNewUser,
  createInvitations,
  declineInvitation,
  previewInvitation,
  resendInvitation,
  withdrawInvitation,
} from './invitations.service'
import { limitStaffRefusals } from './staff-refusal-limit'

// Listing invitations is team.list.
export const invitationsRouter = {
  create: member.invitations.create
    .use(requirePermission('settings', 'create', 'invite people'))
    .use(limitStaffRefusals())
    .handler(async ({ context, input }) => {
      const { emails, sentAt, ownerSends, ...result } = await createInvitations(
        serviceContext(context),
        input,
      )
      const delivered = await deliverInvitations(context, emails, sentAt)
      for (const send of ownerSends) {
        for (const [id, d] of await deliverInvitations(context, [send.message], send.sentAt))
          delivered.set(id, d)
      }
      return {
        ...result,
        invitations: result.invitations.map((row) => ({ ...row, ...delivered.get(row.id) })),
      }
    }),
  resend: member.invitations.resend
    .use(requirePermission('settings', 'create', 'invite people'))
    .use(limitStaffRefusals())
    .handler(async ({ context, input }) => {
      const { emails, sentAt, ...result } = await resendInvitation(
        serviceContext(context),
        input.id,
        input.reason,
      )
      // The invitation and any "Approval needed" or no-approver emails; only the invitation's
      // delivery is recorded.
      await deliverInvitations(context, emails, sentAt)
      return result
    }),
  withdraw: member.invitations.withdraw
    .use(requirePermission('settings', 'delete', 'withdraw invitations'))
    .handler(({ context, input }) => withdrawInvitation(serviceContext(context), input.id)),
  preview: os.invitations.preview
    .use(publicRateLimit('invitationPreview', 30))
    .handler(({ context, input }) => previewInvitation(context.db, input.token)),
  accept: authed.invitations.accept.handler(async ({ context, input }) => {
    const { emails, nextStep } = await acceptInvitation(
      context.db,
      { user: context.user, session: context.session },
      input.token,
    )
    // Joining as an owner alerts every owner.
    await sendAll(context.mailer, emails)
    return { nextStep }
  }),
  acceptAsNewUser: os.invitations.acceptAsNewUser
    .use(publicRateLimit('invitationAccept', 10))
    .handler(async ({ context, input }) => {
      const { email, nextStep, emails } = await acceptInvitationAsNewUser(context.db, input)
      await sendAll(context.mailer, emails)
      // Sign in through Better Auth so the session, cookie and audit go through one path. Their
      // very first sign-in: the browser is remembered without a "new sign-in" email.
      requestScope().auth.firstSignIn = true
      try {
        const { headers } = await context.auth.api.signInEmail({
          body: { email, password: input.password, rememberMe: false },
          headers: context.headers,
          returnHeaders: true,
        })
        for (const cookie of headers.getSetCookie())
          context.resHeaders?.append('set-cookie', cookie)
      } catch (error) {
        // The account and membership are saved; don't report failure, send them to sign in.
        logger.error('Sign-in after accepting an invitation failed', {
          requestId: context.requestId,
          ...errorSummary(error),
        })
        return { nextStep: 'sign_in' as const }
      }
      return { nextStep }
    }),
  decline: os.invitations.decline
    .use(publicRateLimit('invitationDecline', 10))
    .handler(({ context, input }) => declineInvitation(context.db, input.token)),
}
