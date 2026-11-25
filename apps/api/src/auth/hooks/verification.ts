import { AUTH_ERROR_CODES } from '@vento/shared'
import { resetPassword } from '@/email/templates/reset-password'
import { existingAccountSignUp, verifyEmail } from '@/email/templates/verify-email'
import { logger } from '@/lib/logger'
import { requestScope } from '@/lib/request-scope'
import { VERIFICATION_RESEND_PER_HOUR, VERIFICATION_RESEND_PER_MINUTE } from '../policy'
import { addAttempt, countAttempts } from '../security-store'
import { type AuthDeps, authError, sendEmail, webUrl } from './deps'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Seconds until another verification email may be sent, or 0 when it may go now. */
export async function verificationRetryAfter(deps: AuthDeps, email: string): Promise<number> {
  const now = Date.now()
  const minute = await countAttempts(deps.db, 'verification_email', email, MINUTE)
  if (minute.count >= VERIFICATION_RESEND_PER_MINUTE && minute.latest) {
    return Math.max(1, Math.ceil((minute.latest.getTime() + MINUTE - now) / 1000))
  }
  const hour = await countAttempts(deps.db, 'verification_email', email, HOUR)
  if (hour.count >= VERIFICATION_RESEND_PER_HOUR && hour.oldest) {
    return Math.max(1, Math.ceil((hour.oldest.getTime() + HOUR - now) / 1000))
  }
  return 0
}

/** The Resend button: once a minute, 5 times an hour (spec). */
export async function assertCanResendVerification(deps: AuthDeps, email: unknown): Promise<void> {
  if (typeof email !== 'string') return
  const retryAfterSeconds = await verificationRetryAfter(deps, email.toLowerCase())
  if (retryAfterSeconds > 0) {
    throw authError(
      'TOO_MANY_REQUESTS',
      AUTH_ERROR_CODES.VERIFICATION_RESEND_LIMITED,
      'Wait a moment before asking for another email.',
      { retryAfterSeconds },
    )
  }
}

/** One email carries both the link and the 6-digit code. */
export async function sendVerificationEmail(
  deps: AuthDeps,
  data: { user: { email: string; name: string }; url: string },
): Promise<void> {
  const email = data.user.email.toLowerCase()
  // Sign-in by an unverified person also sends; the same limit applies there, silently.
  if ((await verificationRetryAfter(deps, email)) > 0) {
    logger.info('Verification email not sent: resend limit', {
      requestId: requestScope().requestId,
    })
    return
  }
  await addAttempt(deps.db, 'verification_email', email)
  const code = await deps
    .api()
    .createVerificationOTP({ body: { email, type: 'email-verification' } })
  await sendEmail(
    deps,
    email,
    'verify_email',
    verifyEmail({ name: data.user.name, url: data.url, code }),
  )
}

export async function sendResetPasswordEmail(
  deps: AuthDeps,
  data: { user: { email: string; name: string }; url: string },
): Promise<void> {
  const email = data.user.email.toLowerCase()
  const hour = await countAttempts(deps.db, 'password_reset_email', email, HOUR)
  // Stops mail-bombing one inbox; the reply on screen is the same either way.
  if (hour.count >= 5) return
  await addAttempt(deps.db, 'password_reset_email', email)
  await sendEmail(
    deps,
    email,
    'reset_password',
    resetPassword({ name: data.user.name, url: data.url }),
  )
}

/** Owner's decision 9: a duplicate sign-up looks normal on screen and notifies the real owner. */
export async function sendExistingAccountNotice(
  deps: AuthDeps,
  user: { email: string; name: string },
): Promise<void> {
  await sendEmail(
    deps,
    user.email,
    'existing_account',
    existingAccountSignUp({
      name: user.name,
      signInUrl: webUrl('/sign-in'),
      resetUrl: webUrl('/forgot-password'),
    }),
  )
}
