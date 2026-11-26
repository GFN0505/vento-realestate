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

// Listing invitations is team.list.
export const invitationsRouter = {
  create: member.invitations.create
    .use(requirePermission('settings', 'create', 'invite people'))
    .handler(async ({ context, input }) => {
      const { emails, sentAt, ...result } = await createInvitations(serviceContext(context), input)
      const delivered = await deliverInvitations(context, emails, sentAt)
      return {
        ...result,
        invitations: result.invitations.map((row) => ({ ...row, ...delivered.get(row.id) })),
      }
    }),
  resend: member.invitations.resend
    .use(requirePermission('settings', 'create', 'invite people'))
    .handler(async ({ context, input }) => {
      const { emails, sentAt, notice } = await resendInvitation(serviceContext(context), input.id)
      await deliverInvitations(context, emails, sentAt)
      return { notice }
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
