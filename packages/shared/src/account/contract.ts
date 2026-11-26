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
import {
  confirmPasswordInput,
  confirmPasswordOutput,
  removePasskeyInput,
  renamePasskeyInput,
  securityOverview,
  updateNameInput,
  updateNameOutput,
} from './security'

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
  /** My security: name, password, two-step, backup codes and passkeys of the signed-in person. */
  security: platform.output(securityOverview),
  /**
   * "Confirm it's you": opens a 5-minute window on this session for adding a passkey. Wrong:
   * BAD_REQUEST `wrong_password` (counts towards the sign-in lock). Locked or too fast:
   * TOO_MANY_REQUESTS.
   */
  confirmPassword: platform.input(confirmPasswordInput).output(confirmPasswordOutput),
  updateName: platform.input(updateNameInput).output(updateNameOutput),
  passkeys: {
    /** Not yours, gone, or passkeys unavailable here: NOT_FOUND. */
    rename: platform.input(renamePasskeyInput).output(notice),
    /** Works whatever the flag: a person can always remove their own passkey. */
    remove: platform.input(removePasskeyInput).output(notice),
  },
  sessions: {
    list: platform.input(paginationInput.strict()).output(paginated(sessionItem)),
    revoke: platform.input(z.strictObject({ id })).output(notice),
    /** "Sign out everywhere else". */
    revokeOthers: platform.output(notice.extend({ count: z.number().int().min(0) })),
  },
}
