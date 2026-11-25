import { z } from 'zod'
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, PASSWORD_RULE_ERROR_CODES } from './error-codes'
import { CURRENT_TERMS_VERSION, PASSWORD_MAX_LENGTH, unmetPasswordRules } from './password-rules'

/**
 * The local rules as a zod schema, for forms and for the accept-invitation procedure.
 * One issue per missing rule, in display order, so a form can list them all.
 */
export const newPassword = z
  .string()
  .max(PASSWORD_MAX_LENGTH, { message: `Use ${PASSWORD_MAX_LENGTH} characters or fewer` })
  .superRefine((value, ctx) => {
    for (const rule of unmetPasswordRules(value)) {
      ctx.addIssue({
        code: 'custom',
        message: AUTH_ERROR_MESSAGES[PASSWORD_RULE_ERROR_CODES[rule]],
      })
    }
  })

/** The terms and privacy notice version being accepted (sign-up and accepting an invitation). */
export const termsVersion = z.literal(CURRENT_TERMS_VERSION, {
  message: AUTH_ERROR_MESSAGES[AUTH_ERROR_CODES.TERMS_NOT_ACCEPTED],
})
