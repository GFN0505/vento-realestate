import { z } from 'zod'
import { base } from '../common/errors'
import { id, paginated, paginationInput } from '../common/schemas'
import {
  me,
  notice,
  resetTokenInput,
  sessionItem,
  switchOrganizationInput,
  switchOrganizationOutput,
} from './schema'

export const accountContract = {
  /** Who is signed in, their organization and role, and where to go next. */
  me: base.output(me),
  /**
   * Makes another of the person's organizations active for this session and their next sign-in.
   * Not a member, removed, or no such organization: NOT_FOUND, the same answer for each.
   */
  switchOrganization: base.input(switchOrganizationInput).output(switchOrganizationOutput),
  /** Public. The email a reset link belongs to, for the "Reset password" screen. */
  passwordResetInfo: base.input(resetTokenInput).output(z.object({ email: z.string() })),
  sessions: {
    list: base.input(paginationInput.strict()).output(paginated(sessionItem)),
    revoke: base.input(z.strictObject({ id })).output(notice),
    /** "Sign out everywhere else". */
    revokeOthers: base.output(notice.extend({ count: z.number().int().min(0) })),
  },
}
