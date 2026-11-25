import { publicRateLimit, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { logger } from '@/lib/logger'
import { authed, member, os } from '@/orpc'
import {
  acceptInvitation,
  acceptInvitationAsNewUser,
  createInvitations,
  declineInvitation,
  listInvitations,
  previewInvitation,
  resendInvitation,
  withdrawInvitation,
} from './invitations.service'

export const invitationsRouter = {
  list: member.invitations.list
    .use(requirePermission('settings', 'view', 'see invitations'))
    .handler(({ context, input }) => listInvitations(serviceContext(context), input)),
  create: member.invitations.create
    .use(requirePermission('settings', 'create', 'invite people'))
    .handler(async ({ context, input }) => {
      const { emails, ...result } = await createInvitations(serviceContext(context), input)
      await sendAll(context.mailer, emails)
      return result
    }),
  resend: member.invitations.resend
    .use(requirePermission('settings', 'create', 'invite people'))
    .handler(async ({ context, input }) => {
      const { emails, notice } = await resendInvitation(serviceContext(context), input.id)
      await sendAll(context.mailer, emails)
      return { notice }
    }),
  withdraw: member.invitations.withdraw
    .use(requirePermission('settings', 'delete', 'withdraw invitations'))
    .handler(({ context, input }) => withdrawInvitation(serviceContext(context), input.id)),
  preview: os.invitations.preview
    .use(publicRateLimit('invitationPreview', 30))
    .handler(({ context, input }) => previewInvitation(context.db, input.token)),
  accept: authed.invitations.accept.handler(({ context, input }) =>
    acceptInvitation(context.db, { user: context.user, session: context.session }, input.token),
  ),
  acceptAsNewUser: os.invitations.acceptAsNewUser
    .use(publicRateLimit('invitationAccept', 10))
    .handler(async ({ context, input }) => {
      const { email, nextStep } = await acceptInvitationAsNewUser(context.db, input)
      // Sign in through Better Auth so the session, cookie and audit go through one path.
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
          error: error instanceof Error ? error.message : String(error),
        })
        return { nextStep: 'sign_in' as const }
      }
      return { nextStep }
    }),
  decline: os.invitations.decline
    .use(publicRateLimit('invitationDecline', 10))
    .handler(({ context, input }) => declineInvitation(context.db, input.token)),
}
