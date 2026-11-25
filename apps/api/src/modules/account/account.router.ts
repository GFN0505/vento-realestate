import { publicRateLimit } from '@/access/middleware'
import { authed, os } from '@/orpc'
import {
  getMe,
  listSessions,
  passwordResetInfo,
  revokeOtherSessions,
  revokeSession,
} from './account.service'

export const accountRouter = {
  me: authed.account.me.handler(({ context }) => getMe(context.db, context.user, context.session)),
  passwordResetInfo: os.account.passwordResetInfo
    .use(publicRateLimit('passwordResetInfo', 20))
    .handler(({ context, input }) => passwordResetInfo(context.db, input.token)),
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
