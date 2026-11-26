import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, PASSKEY_LIMIT } from '@vento/shared'
import { and, desc, eq } from 'drizzle-orm'
import { listActiveMemberships } from '@/access/context'
import { passkeys, sessions } from '@/db/schema'
import { passkeyAddedAlert } from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import {
  passkeysAvailableForUser,
  passkeysAvailableHere,
  passkeysSwitchedOff,
} from '../passkey-availability'
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

/**
 * A verified passkey made a session. Refuse it (deleting the session) when the person must set a
 * new password, belongs to no organization, or has passkeys available nowhere; otherwise record
 * the use and finish the sign-in. A failed passkey check never counts towards a lock.
 */
export async function afterPasskeySignIn(
  deps: AuthDeps,
  ctx: PasskeySignInContext,
  credentialId: unknown,
): Promise<Response | undefined> {
  if (errorCode(ctx.context.returned)) return
  const created = ctx.context.newSession
  if (!created) return
  const user = await findUserById(deps.db, created.user.id)
  const refuse = async (status: 401 | 403, code: keyof typeof AUTH_ERROR_MESSAGES) => {
    await deps.db.delete(sessions).where(eq(sessions.token, created.session.token))
    ctx.context.setNewSession(null)
    return errorResponse(status, { code, message: AUTH_ERROR_MESSAGES[code] })
  }
  if (!user) return refuse(401, 'PASSKEY_NOT_RECOGNISED')
  if (user.passwordResetRequired) return refuse(403, 'PASSWORD_RESET_REQUIRED')
  // Removed from every organization reads like an unknown passkey: it reveals nothing.
  if ((await listActiveMemberships(deps.db, user.id)).length === 0) {
    return refuse(401, 'PASSKEY_NOT_RECOGNISED')
  }
  if (!(await passkeysAvailableForUser(deps.db, deps.features, user.id))) {
    return refuse(403, 'PASSKEYS_UNAVAILABLE')
  }
  if (typeof credentialId === 'string') {
    await deps.db
      .update(passkeys)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(passkeys.credentialID, credentialId), eq(passkeys.userId, user.id)))
  }
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
