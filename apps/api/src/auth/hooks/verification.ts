import { AUTH_ERROR_CODES } from '@vento/shared'
import { resetPassword } from '@/email/templates/reset-password'
import {
  existingAccountSignUp,
  existingStaffAccountSignUp,
  verifyEmail,
} from '@/email/templates/verify-email'
import { logger } from '@/lib/logger'
import { requestScope } from '@/lib/request-scope'
import { staffAccountState } from '@/platform/staff-accounts'
import { VERIFICATION_RESEND_PER_HOUR, VERIFICATION_RESEND_PER_MINUTE } from '../policy'
import { addAttempt, countAttempts, findUserByEmail } from '../security-store'
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

/**
 * The Resend button: once a minute, 5 times an hour (spec). Every request counts, for unknown,
 * verified and unverified emails alike, so a 429 never hints whether an account exists.
 */
export async function assertCanResendVerification(
  deps: AuthDeps,
  email: string | null,
): Promise<void> {
  if (!email) return
  const retryAfterSeconds = await verificationRetryAfter(deps, email)
  if (retryAfterSeconds > 0) {
    throw authError(
      'TOO_MANY_REQUESTS',
      AUTH_ERROR_CODES.VERIFICATION_RESEND_LIMITED,
      'Wait a moment before asking for another email.',
      { retryAfterSeconds },
    )
  }
  await addAttempt(deps.db, 'verification_email', email)
  requestScope().auth.verificationCounted = true
}

/** One email carries both the link and the 6-digit code. */
export async function sendVerificationEmail(
  deps: AuthDeps,
  data: { user: { email: string; name: string }; url: string },
): Promise<void> {
  const email = data.user.email.toLowerCase()
  if (!requestScope().auth.verificationCounted) {
    // Sign-up, and sign-in by an unverified person, also send; the same limit applies, silently.
    if ((await verificationRetryAfter(deps, email)) > 0) {
      logger.info('Verification email not sent: resend limit', {
        requestId: requestScope().requestId,
      })
      return
    }
    await addAttempt(deps.db, 'verification_email', email)
  }
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
  // An unfinished or closed staff account has no password to reset: the inviter resends the
  // invitation instead (admin-console plan §1b.6). The screen says the same either way.
  const person = await findUserByEmail(deps.db, email)
  if (
    person?.accountKind === 'staff' &&
    (await staffAccountState(deps.db, person.id)) !== 'active'
  ) {
    return
  }
  const hour = await countAttempts(deps.db, 'password_reset_email', email, HOUR)
  // Stops mail-bombing one inbox; the reply on screen is the same either way. A super-admin's
  // reset (audited, with a reason) always sends.
  if (hour.count >= 5 && !requestScope().auth.adminResetLink) return
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
  const person = await findUserByEmail(deps.db, user.email)
  if (person?.accountKind === 'staff') {
    await sendEmail(
      deps,
      user.email,
      'existing_account',
      existingStaffAccountSignUp({ name: user.name, signInUrl: webUrl('/sign-in') }),
    )
    return
  }
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
