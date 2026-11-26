import { z } from 'zod'
import { platform } from '../common/errors'
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
  me: platform.output(me),
  /**
   * Makes another of the person's organizations active for this session and their next sign-in.
   * Not a member, removed, or no such organization: NOT_FOUND, the same answer for each.
   */
  switchOrganization: platform.input(switchOrganizationInput).output(switchOrganizationOutput),
  /** Public. The email a reset link belongs to, for the "Reset password" screen. */
  passwordResetInfo: platform.input(resetTokenInput).output(z.object({ email: z.string() })),
  sessions: {
    list: platform.input(paginationInput.strict()).output(paginated(sessionItem)),
    revoke: platform.input(z.strictObject({ id })).output(notice),
    /** "Sign out everywhere else". */
    revokeOthers: platform.output(notice.extend({ count: z.number().int().min(0) })),
  },
}
