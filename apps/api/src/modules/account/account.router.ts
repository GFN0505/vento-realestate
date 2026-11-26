import { publicRateLimit } from '@/access/middleware'
import { sendAll } from '@/email/mailer'
import { authed, os } from '@/orpc'
import {
  getMe,
  listSessions,
  passwordResetInfo,
  revokeOtherSessions,
  revokeSession,
  switchOrganization,
} from './account.service'
import {
  confirmPassword,
  getSecurity,
  removePasskey,
  renamePasskey,
  updateName,
} from './security.service'

// Personal procedures (My security, sessions) are `authed`, not `member`: they read no
// organization data, so the tab guard doesn't apply, and they work during forced two-step setup.
export const accountRouter = {
  // Not behind the tab guard: `me` is how a tab learns the truth, and switching is deliberate.
  me: authed.account.me.handler(({ context }) =>
    getMe(context.db, context.user, context.session, context.featureStore),
  ),
  switchOrganization: authed.account.switchOrganization.handler(({ context, input }) =>
    switchOrganization(context.db, context.user, context.session, input.organizationId),
  ),
  passwordResetInfo: os.account.passwordResetInfo
    .use(publicRateLimit('passwordResetInfo', 20))
    .handler(({ context, input }) => passwordResetInfo(context.db, input.token)),
  security: authed.account.security.handler(({ context }) =>
    getSecurity(context.db, context.auth, context.user, context.session, context.featureStore),
  ),
  confirmPassword: authed.account.confirmPassword.handler(({ context, input }) =>
    confirmPassword(context, context.user, context.session, input.password),
  ),
  updateName: authed.account.updateName.handler(({ context, input }) =>
    updateName(context.db, context.user, input.name),
  ),
  passkeys: {
    rename: authed.account.passkeys.rename.handler(({ context, input }) =>
      renamePasskey(context.db, context.featureStore, context.user, context.session, input),
    ),
    remove: authed.account.passkeys.remove.handler(async ({ context, input }) => {
      const { emails, notice } = await removePasskey(context.db, context.user, input.id)
      await sendAll(context.mailer, emails)
      return { notice }
    }),
  },
  sessions: {
    list: authed.account.sessions.list.handler(({ context, input }) =>
      listSessions(context.db, context.user, context.session, input),
    ),
    revoke: authed.account.sessions.revoke.handler(({ context, input }) =>
      revokeSession(context.db, context.user, input.id),
    ),
    revokeOthers: authed.account.sessions.revokeOthers.handler(({ context }) =>
      revokeOtherSessions(context.db, context.user, context.session),
    ),
  },
}
