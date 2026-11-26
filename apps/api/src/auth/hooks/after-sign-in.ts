import { newSignInAlert } from '@/email/templates/security-alert'
import { env } from '@/env'
import { userAgentLabel } from '@/lib/client-ip'
import { formatDate, formatTime } from '@/lib/format'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { newDeviceToken, recordDevice } from '../known-devices'
import { DEVICE_COOKIE_MAX_AGE_SECONDS } from '../policy'
import { clearAttempts, type IdentityUser } from '../security-store'
import { type AuthDeps, sendEmail, webUrl } from './deps'

export type SignInMethod = 'password' | 'totp' | 'backup_code' | 'passkey'

/** The parts of a Better Auth hook context the finisher touches (cookies and the new session). */
export type SignInContext = {
  getCookie(name: string): string | null | undefined
  setCookie(
    name: string,
    value: string,
    options: {
      httpOnly: boolean
      secure: boolean
      sameSite: 'lax'
      path: string
      maxAge: number
    },
  ): unknown
  context: {
    createAuthCookie(name: string): { name: string }
    newSession?: { session: Record<string, unknown> } | null
  }
}

function placeOf(session: Record<string, unknown> | undefined): string | null {
  return typeof session?.place === 'string' ? session.place : null
}

/**
 * Remembers the browser and, unless this is a first sign-in, emails the person when it's one
 * not seen in 90 days. The cookie is set when missing. Sign-in never fails over this.
 */
export async function checkDevice(
  deps: AuthDeps,
  ctx: SignInContext,
  user: IdentityUser,
  options: { alert: boolean },
): Promise<void> {
  const name = ctx.context.createAuthCookie('device').name
  let token = ctx.getCookie(name) || null
  if (!token) {
    token = newDeviceToken()
    ctx.setCookie(name, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    })
  }
  const { isNew } = await recordDevice(deps.db, user.id, token)
  if (!isNew || !options.alert) return
  const scope = requestScope()
  const now = new Date()
  await sendEmail(
    deps,
    user.email,
    'security_alert',
    newSignInAlert({
      device: userAgentLabel(scope.userAgent) ?? 'a browser',
      place: placeOf(ctx.context.newSession?.session),
      at: formatTime(now),
      on: formatDate(now),
      securityUrl: webUrl('/settings/security'),
    }),
  )
}

/**
 * Every successful sign-in ends here (password without two-step, code, backup code, passkey),
 * so the paths can't drift: failures cleared, audited, browser recognised or announced.
 */
export async function afterSignIn(
  deps: AuthDeps,
  ctx: SignInContext,
  user: IdentityUser,
  method: SignInMethod,
): Promise<void> {
  await clearAttempts(deps.db, 'password_failure', user.email)
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'auth.signed_in',
    actor: { userId: user.id, name: user.name },
    metadata: { method },
  })
  await checkDevice(deps, ctx, user, { alert: !requestScope().auth.firstSignIn })
}
