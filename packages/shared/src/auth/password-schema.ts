import { z } from 'zod'
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES } from './error-codes'
import { CURRENT_TERMS_VERSION, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password-rules'

/** The local rules as a zod schema, for forms and for the accept-invitation procedure. */
export const newPassword = z
  .string()
  .max(PASSWORD_MAX_LENGTH, { message: 'Use 128 characters or fewer' })
  .refine((v) => v.length >= PASSWORD_MIN_LENGTH, {
    message: AUTH_ERROR_MESSAGES[AUTH_ERROR_CODES.PASSWORD_TOO_SHORT],
  })
  .refine((v) => /\d/.test(v), {
    message: AUTH_ERROR_MESSAGES[AUTH_ERROR_CODES.PASSWORD_NEEDS_NUMBER],
  })

/** The terms and privacy notice version being accepted (sign-up and accepting an invitation). */
export const termsVersion = z.literal(CURRENT_TERMS_VERSION, {
  message: AUTH_ERROR_MESSAGES[AUTH_ERROR_CODES.TERMS_NOT_ACCEPTED],
})
