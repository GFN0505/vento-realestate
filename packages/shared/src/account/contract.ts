import { z } from 'zod'
import { base } from '../common/errors'
import { id, paginated, paginationInput } from '../common/schemas'
import { me, notice, resetTokenInput, sessionItem } from './schema'

export const accountContract = {
  /** Who is signed in, their organization and role, and where to go next. */
  me: base.output(me),
  /** Public. The email a reset link belongs to, for the "Reset password" screen. */
  passwordResetInfo: base.input(resetTokenInput).output(z.object({ email: z.string() })),
  sessions: {
    list: base.input(paginationInput.strict()).output(paginated(sessionItem)),
    revoke: base.input(z.strictObject({ id })).output(notice),
    /** "Sign out everywhere else". */
    revokeOthers: base.output(notice.extend({ count: z.number().int().min(0) })),
  },
}
