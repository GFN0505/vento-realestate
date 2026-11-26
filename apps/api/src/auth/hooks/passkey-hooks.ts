import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, PASSKEY_LIMIT } from '@vento/shared'
import { and, desc, eq, gt } from 'drizzle-orm'
import { listActiveMemberships } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { auditEvents, passkeys, sessions } from '@/db/schema'
import { passkeyAddedAlert, passkeyCopiedAlert } from '@/email/templates/security-alert'
import { env } from '@/env'
import { formatDate, formatTime } from '@/lib/format'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { activeSuperAdmin } from '@/platform/super-admins'
import {
  passkeysAvailableForUser,
  passkeysAvailableHere,
  passkeysSwitchedOff,
} from '../passkey-availability'
import { isSuspectedClone, readAssertion } from '../passkey-clone'
import { REAUTH_WINDOW_MS } from '../policy'
import { findUserById, passkeyCountFor } from '../security-store'
import { afterSignIn, type SignInContext } from './after-sign-in'
import { type AuthDeps, authError, errorCode, errorResponse, sendEmail, webUrl } from './deps'

// Before- and after-hooks for the passkey plugin's four live endpoints (plan §4.3, §4.4). Its
// list, update and delete endpoints are switched off: our audited procedures replace them.

export type HookSession = {
  userId: string
  activeOrganizationId: string | null
  reauthenticatedAt: Date | null
}

const webOrigin = () => new URL(env.WEB_ORIGIN).origin

const unavailable = () =>
  authError(
    'NOT_FOUND',
    AUTH_ERROR_CODES.PASSKEYS_UNAVAILABLE,
    AUTH_ERROR_MESSAGES.PASSKEYS_UNAVAILABLE,
  )

/**
 * Both registration steps: passkeys available to the active organization and fewer than 10. The
 * options step also needs "Confirm it's you" within 5 minutes; the verify step is bound to a
 * challenge issued under that window, so it doesn't ask again.
 */
export async function beforePasskeyRegistration(
  deps: AuthDeps,
  session: HookSession | null,
  step: 'options' | 'verify',
  now = new Date(),
): Promise<void> {
  // No session: the plugin answers 401 itself.
  if (!session) return
  if (!(await passkeysAvailableHere(deps.db, deps.features, session))) throw unavailable()
  const confirmedAt = session.reauthenticatedAt?.getTime() ?? 0
  if (step === 'options' && now.getTime() - confirmedAt > REAUTH_WINDOW_MS) {
    throw authError(
      'FORBIDDEN',
      AUTH_ERROR_CODES.REAUTH_REQUIRED,
      AUTH_ERROR_MESSAGES.REAUTH_REQUIRED,
    )
  }
  if ((await passkeyCountFor(deps.db, session.userId)) >= PASSKEY_LIMIT) {
    throw authError('CONFLICT', AUTH_ERROR_CODES.PASSKEY_LIMIT, AUTH_ERROR_MESSAGES.PASSKEY_LIMIT)
  }
}

/** The kill switch, before anyone is known. Everything person-specific waits for the after-hook. */
export async function beforePasskeyAuthenticateOptions(deps: AuthDeps): Promise<void> {
  if (await passkeysSwitchedOff(deps.features)) throw unavailable()
}

/** The plugin always asks for a 30-day session; the session hook trims it unless remembered. */
export function readRememberMe(value: string | null | undefined): void {
  requestScope().auth.rememberMe = value === '1'
}

/**
 * Keeps this request's challenge before the plugin consumes it, so a failed sign-in can be checked
 * for a copied key (passkey-clone.ts).
 */
export async function rememberChallenge(ctx: ChallengeContext): Promise<void> {
  const cookie = ctx.context.createAuthCookie('passkey_challenge').name
  const token = await ctx.getSignedCookie(cookie, ctx.context.secret)
  const row = token ? await ctx.context.internalAdapter.findVerificationValue(token) : null
  try {
    const value = row ? (JSON.parse(row.value) as { expectedChallenge?: unknown }) : null
    if (typeof value?.expectedChallenge === 'string') {
      requestScope().auth.passkeyChallenge = value.expectedChallenge
    }
  } catch {
    // Not ours to judge: the plugin answers a bad challenge itself.
  }
}

export type ChallengeContext = {
  getSignedCookie(name: string, secret: string): Promise<string | null | false>
  context: {
    secret: string
    createAuthCookie(name: string): { name: string }
    internalAdapter: {
      findVerificationValue(identifier: string): Promise<{ value: string } | null>
    }
  }
}

/** What the passkey sign-in after-hook needs from Better Auth's context. */
export type PasskeySignInContext = SignInContext & {
  context: SignInContext['context'] & {
    returned: unknown
    newSession?: {
      session: Record<string, unknown> & { token: string }
      user: { id: string }
    } | null
    setNewSession(session: null): void
  }
}

/** Better Auth's cookie helpers, applied to the hook context (typed loosely by Better Auth). */
export type SessionCookies = {
  /** Expires the session cookies and drops any value already on this response. */
  drop(): void
  /** Re-issues the session cookie without max-age: it ends when the browser closes. */
  forBrowserSession(): Promise<void>
}

/**
 * Audits and emails a suspected copy, at most one email an hour per passkey. The expected
 * challenge is this request's (`requestScope().auth.passkeyChallenge`); the console sets it too.
 */
export async function reportSuspectedClone(
  deps: Pick<AuthDeps, 'mailer'> & { db: DbOrTx },
  response: unknown,
): Promise<void> {
  const assertion = readAssertion(response)
  if (!assertion) return
  const [stored] = await deps.db
    .select({
      id: passkeys.id,
      userId: passkeys.userId,
      name: passkeys.name,
      counter: passkeys.counter,
      publicKey: passkeys.publicKey,
    })
    .from(passkeys)
    .where(eq(passkeys.credentialID, assertion.credentialId))
  const expected = { challenge: requestScope().auth.passkeyChallenge, origin: webOrigin() }
  if (!stored || !isSuspectedClone(assertion, stored, expected)) return
  const user = await findUserById(deps.db, stored.userId)
  if (!user) return
  const [recent] = await deps.db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.action, 'passkey.suspected_clone'),
        eq(auditEvents.targetId, stored.id),
        gt(auditEvents.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    )
    .limit(1)
  const name = stored.name ?? 'Passkey'
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'passkey.suspected_clone',
    actor: { userId: null, name: 'Sign-in attempt' },
    target: { type: 'passkey', id: stored.id, label: name },
  })
  if (recent) return
  const now = new Date()
  await sendEmail(
    deps,
    user.email,
    'security_alert',
    passkeyCopiedAlert({
      name,
      at: formatTime(now),
      on: formatDate(now),
      securityUrl: webUrl('/settings/security'),
      resetUrl: webUrl('/forgot-password'),
    }),
  )
}

/**
 * A verified passkey made a session. Refuse it (deleting the session and its cookie) when the
 * person must set a new password, belongs to no organization, or has passkeys available nowhere;
 * otherwise record the use and finish the sign-in. A failed passkey check never counts towards a
 * lock, but one that looks like a copied key is reported.
 */
export async function afterPasskeySignIn(
  deps: AuthDeps,
  ctx: PasskeySignInContext,
  cookies: SessionCookies,
  response: unknown,
): Promise<Response | undefined> {
  const code = errorCode(ctx.context.returned)
  if (code === AUTH_ERROR_CODES.AUTHENTICATION_FAILED) await reportSuspectedClone(deps, response)
  if (code) return
  const created = ctx.context.newSession
  if (!created) return
  const user = await findUserById(deps.db, created.user.id)
  const refuse = async (status: 401 | 403, code: keyof typeof AUTH_ERROR_MESSAGES) => {
    await deps.db.delete(sessions).where(eq(sessions.token, created.session.token))
    cookies.drop()
    ctx.context.setNewSession(null)
    return errorResponse(status, { code, message: AUTH_ERROR_MESSAGES[code] })
  }
  if (!user) return refuse(401, 'PASSKEY_NOT_RECOGNISED')
  if (user.passwordResetRequired) return refuse(403, 'PASSWORD_RESET_REQUIRED')
  // Removed from every organization reads like an unknown passkey: it reveals nothing. A Vento
  // super-admin may belong to none: they land on the console.
  if (
    (await listActiveMemberships(deps.db, user.id)).length === 0 &&
    !(await activeSuperAdmin(deps.db, user.id))
  ) {
    return refuse(401, 'PASSKEY_NOT_RECOGNISED')
  }
  if (!(await passkeysAvailableForUser(deps.db, deps.features, user.id))) {
    return refuse(403, 'PASSKEYS_UNAVAILABLE')
  }
  const credentialId = readAssertion(response)?.credentialId
  if (credentialId) {
    await deps.db
      .update(passkeys)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(passkeys.credentialID, credentialId), eq(passkeys.userId, user.id)))
  }
  // Like a password sign-in without "Keep me signed in": the cookie ends with the browser.
  if (requestScope().auth.rememberMe !== true) await cookies.forBrowserSession()
  await afterSignIn(deps, ctx, user, 'passkey')
  return
}

function returnedId(returned: unknown): string | null {
  const id = returned && typeof returned === 'object' ? (returned as { id?: unknown }).id : null
  return typeof id === 'string' ? id : null
}

/** Audits and announces a new passkey; maps the database's 10-per-person backstop to 409. */
export async function afterPasskeyRegistration(
  deps: AuthDeps,
  userId: string | undefined,
  returned: unknown,
): Promise<Response | undefined> {
  if (!userId) return
  const code = errorCode(returned)
  if (code) {
    // The trigger's refusal surfaces as the plugin's generic failure; say what it really was.
    if (
      code === AUTH_ERROR_CODES.FAILED_TO_VERIFY_REGISTRATION &&
      (await passkeyCountFor(deps.db, userId)) >= PASSKEY_LIMIT
    ) {
      return errorResponse(409, {
        code: AUTH_ERROR_CODES.PASSKEY_LIMIT,
        message: AUTH_ERROR_MESSAGES.PASSKEY_LIMIT,
      })
    }
    return
  }
  const user = await findUserById(deps.db, userId)
  const id = returnedId(returned)
  const [row] = await deps.db
    .select({ id: passkeys.id, name: passkeys.name })
    .from(passkeys)
    .where(id ? and(eq(passkeys.id, id), eq(passkeys.userId, userId)) : eq(passkeys.userId, userId))
    .orderBy(desc(passkeys.createdAt))
    .limit(1)
  if (!user || !row) return
  const name = row.name ?? 'Passkey'
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'passkey.added',
    actor: { userId: user.id, name: user.name },
    target: { type: 'passkey', id: row.id, label: name },
  })
  const now = new Date()
  await sendEmail(
    deps,
    user.email,
    'security_alert',
    passkeyAddedAlert({
      name,
      at: formatTime(now),
      on: formatDate(now),
      securityUrl: webUrl('/settings/security'),
      resetUrl: webUrl('/forgot-password'),
    }),
  )
  return
}
