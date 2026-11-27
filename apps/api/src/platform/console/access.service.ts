import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES } from '@vento/shared'
import type { ConfirmInput, ConsoleStatus } from '@vento/shared/console'
import type { SymmetricDecryptOptions } from 'better-auth/crypto'
import { and, count, eq } from 'drizzle-orm'
import { consoleWindow, proofIsFresh } from '@/access/console-window'
import type { AuthSession, AuthUser } from '@/access/context'
import type { AuthServerApi } from '@/auth/hooks/deps'
import { reportSuspectedClone } from '@/auth/hooks/passkey-hooks'
import { onBackupCodeUsed } from '@/auth/hooks/two-step-guard'
import { passkeysSwitchedOff } from '@/auth/passkey-availability'
import { readAssertion } from '@/auth/passkey-clone'
import { CONSOLE_CONFIRM_PER_MINUTE, CONSOLE_PASSKEY_CHALLENGE_MS } from '@/auth/policy'
import {
  clearWrongCodes,
  isWrongCode,
  onWrongCode,
  recordTotpStep,
  totpStepOf,
  twoStepLockedUntil,
  verifyCodeInPlace,
} from '@/auth/second-factor'
import { activeLockUntil } from '@/auth/security-store'
import { webAuthnSettings } from '@/auth/webauthn-settings'
import type { DbOrTx } from '@/db/client'
import { passkeys, sessions, twoFactors, verifications } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { badRequest, notFound, tooManyRequests } from '@/lib/errors'
import type { RateLimiter } from '@/lib/rate-limit'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import type { FeatureStore } from '../feature-store'
import type { ActiveSuperAdmin } from '../super-admins'

// "Confirm it's you" for the Vento console (admin-console plan §4.3). A passkey, an authenticator
// code or a backup code; never a password. Proving it opens the console window on this session.

export type AccessContext = {
  db: DbOrTx
  user: AuthUser
  session: AuthSession
  admin: ActiveSuperAdmin
  headers: Headers
  mailer: Mailer
  rateLimiter: RateLimiter
  featureStore: FeatureStore
  authApi: Pick<AuthServerApi, 'verifyTOTP' | 'verifyBackupCode' | 'viewBackupCodes'>
  /** Better Auth's key for the stored authenticator secret, to refuse a replayed code (L4). */
  totpKey?: () => Promise<TotpKey | undefined>
}

type Method = 'passkey' | 'code' | 'backup_code' | 'recent_proof'

export type TotpKey = SymmetricDecryptOptions['key']

const challengeId = (sessionId: string) => `console-passkey:${sessionId}`

async function passkeyIds(db: DbOrTx, userId: string) {
  return db
    .select({ id: passkeys.credentialID, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
}

async function canUsePasskey(ctx: AccessContext): Promise<boolean> {
  if (await passkeysSwitchedOff(ctx.featureStore)) return false
  const [row] = await ctx.db
    .select({ n: count() })
    .from(passkeys)
    .where(eq(passkeys.userId, ctx.user.id))
  return (row?.n ?? 0) > 0
}

function statusOf(
  ctx: Pick<AccessContext, 'admin' | 'session'>,
  session: Pick<AuthSession, 'secondFactorAt' | 'consoleOpenedAt' | 'consoleActiveAt'>,
  passkey: boolean,
  now: Date,
): ConsoleStatus {
  const methods = { passkey }
  if (!ctx.admin.twoFactorEnabled) {
    return { window: 'two_step_required', closesAt: null, freshProof: false, methods }
  }
  const window = consoleWindow(session, now)
  return {
    window: window.open ? 'open' : 'closed',
    closesAt: window.open ? window.closesAt.toISOString() : null,
    freshProof: proofIsFresh(session, now),
    methods,
  }
}

export async function status(ctx: AccessContext, now = new Date()): Promise<ConsoleStatus> {
  return statusOf(ctx, ctx.session, await canUsePasskey(ctx), now)
}

/** Opens the window on this session and records it in the person's own trail. */
async function openWindow(ctx: AccessContext, method: Method, now: Date): Promise<ConsoleStatus> {
  const proven = method === 'recent_proof' ? {} : { secondFactorAt: now }
  await ctx.db
    .update(sessions)
    .set({ ...proven, consoleOpenedAt: now, consoleActiveAt: now })
    .where(eq(sessions.id, ctx.session.id))
  await recordAccountEvent(ctx.db, {
    userId: ctx.user.id,
    action: 'console.opened',
    actor: { userId: ctx.user.id, name: ctx.user.name },
    metadata: { method },
  })
  const session = {
    secondFactorAt: method === 'recent_proof' ? ctx.session.secondFactorAt : now,
    consoleOpenedAt: now,
    consoleActiveAt: now,
  }
  return statusOf(ctx, session, await canUsePasskey(ctx), now)
}

/** Opens without a prompt only when a passkey or code was proven in the last 5 minutes. */
export async function open(ctx: AccessContext, now = new Date()): Promise<ConsoleStatus> {
  if (consoleWindow(ctx.session, now).open || !proofIsFresh(ctx.session, now)) {
    return status(ctx, now)
  }
  return openWindow(ctx, 'recent_proof', now)
}

/** WebAuthn options for this person's passkeys; the challenge is bound to this session. */
export async function passkeyOptions(
  ctx: AccessContext,
  now = new Date(),
): Promise<{ options: Record<string, unknown> }> {
  // Shares the confirm budget (audit L3): options and attempts are one stream per person.
  hitConfirmLimit(ctx)
  if (await passkeysSwitchedOff(ctx.featureStore)) throw notFound()
  const credentials = await passkeyIds(ctx.db, ctx.user.id)
  if (credentials.length === 0) throw notFound()
  const settings = webAuthnSettings()
  const options = await generateAuthenticationOptions({
    rpID: settings.rpID,
    userVerification: settings.userVerification,
    timeout: 60_000,
    allowCredentials: credentials.map((c) => ({
      id: c.id,
      ...(c.transports && {
        transports: c.transports.split(',') as AuthenticatorTransport[],
      }),
    })),
  })
  const identifier = challengeId(ctx.session.id)
  await ctx.db.delete(verifications).where(eq(verifications.identifier, identifier))
  await ctx.db.insert(verifications).values({
    identifier,
    value: options.challenge,
    expiresAt: new Date(now.getTime() + CONSOLE_PASSKEY_CHALLENGE_MS),
  })
  return { options: options as unknown as Record<string, unknown> }
}

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'

const PASSKEY_FAILED = "That passkey didn't work. Try again, or use a code instead."

function passkeyFailed() {
  return badRequest('passkey_failed', PASSKEY_FAILED)
}

/**
 * Checks the assertion with the same library and settings as the passkey plugin, without making
 * a session. The challenge is used once; the credential must be this person's. A failure never
 * counts towards a lock, but one that looks like a copied key is reported.
 */
async function verifyPasskey(ctx: AccessContext, response: Record<string, unknown>, now: Date) {
  const [challenge] = await ctx.db
    .delete(verifications)
    .where(eq(verifications.identifier, challengeId(ctx.session.id)))
    .returning({ value: verifications.value, expiresAt: verifications.expiresAt })
  if (!challenge || challenge.expiresAt <= now) throw passkeyFailed()
  const credentialId = readAssertion(response)?.credentialId
  if (!credentialId) throw passkeyFailed()
  const [stored] = await ctx.db
    .select({
      id: passkeys.id,
      credentialID: passkeys.credentialID,
      publicKey: passkeys.publicKey,
      counter: passkeys.counter,
      transports: passkeys.transports,
      createdAt: passkeys.createdAt,
    })
    .from(passkeys)
    .where(and(eq(passkeys.credentialID, credentialId), eq(passkeys.userId, ctx.user.id)))
  if (!stored) throw passkeyFailed()
  // A passkey added since the last code or passkey proof on this session could have been added
  // with a password alone (audit H1): it can't open the console until a code is proven again.
  const proven = ctx.session.secondFactorAt
  if (!proven || stored.createdAt > proven) {
    throw badRequest(
      'passkey_failed',
      'This passkey was added after you last used a code. Use a code from your authenticator app this time.',
    )
  }
  const settings = webAuthnSettings()
  let newCounter: number
  try {
    const result = await verifyAuthenticationResponse({
      response: response as unknown as Parameters<
        typeof verifyAuthenticationResponse
      >[0]['response'],
      expectedChallenge: challenge.value,
      expectedOrigin: settings.origin,
      expectedRPID: settings.rpID,
      credential: {
        id: stored.credentialID,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
        counter: stored.counter,
        ...(stored.transports && {
          transports: stored.transports.split(',') as AuthenticatorTransport[],
        }),
      },
      requireUserVerification: true,
    })
    if (!result.verified) throw new Error('not verified')
    newCounter = result.authenticationInfo.newCounter
  } catch {
    requestScope().auth.passkeyChallenge = challenge.value
    await reportSuspectedClone(ctx, response)
    throw passkeyFailed()
  }
  await ctx.db
    .update(passkeys)
    .set({ counter: newCounter, lastUsedAt: now })
    .where(eq(passkeys.id, stored.id))
}

function lockedOut(until: Date, now: Date) {
  return tooManyRequests(
    'Too many wrong codes. Sign-in is locked for now; try again later.',
    (until.getTime() - now.getTime()) / 1000,
  )
}

/** Backup codes made without a fresh code or passkey (audit H1). */
async function backupCodesUnproven(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ at: twoFactors.backupCodesUnprovenAt })
    .from(twoFactors)
    .where(eq(twoFactors.userId, userId))
  return Boolean(row?.at)
}

/** A code or backup code, counted towards the same lock as the sign-in page. */
async function verifyCode(
  ctx: AccessContext,
  input: Extract<ConfirmInput, { method: 'code' | 'backup_code' }>,
  now: Date,
) {
  const locked =
    (await twoStepLockedUntil(ctx.db, ctx.user.id)) ??
    (await activeLockUntil(ctx.db, ctx.user.email))
  if (locked) throw lockedOut(locked, now)
  if (input.method === 'backup_code' && (await backupCodesUnproven(ctx.db, ctx.user.id))) {
    // Checked before the code is used, so it isn't spent and doesn't count towards a lock.
    throw badRequest(
      'wrong_code',
      "These backup codes were made with only your password, so they can't open the Vento Real Estate console. Use your authenticator app or a passkey.",
    )
  }
  const step =
    input.method === 'code'
      ? await totpStepOf(ctx.db, ctx.user.id, input.code, await ctx.totpKey?.())
      : null
  // A code already used counts as a wrong one (audit L4).
  const failure = step?.replayed
    ? AUTH_ERROR_CODES.INVALID_CODE
    : await verifyCodeInPlace(
        ctx.authApi,
        ctx.headers,
        input.method === 'code' ? { code: input.code } : { backupCode: input.code },
      )
  if (!failure) {
    await clearWrongCodes(ctx.db, ctx.user.id)
    if (step) await recordTotpStep(ctx.db, ctx.user.id, step.step)
    if (input.method === 'backup_code') {
      await onBackupCodeUsed(
        { db: ctx.db, mailer: ctx.mailer, api: () => ctx.authApi as AuthServerApi },
        ctx.user,
      )
    }
    return
  }
  if (!isWrongCode(failure)) throw notFound()
  const lockedUntil = await onWrongCode(ctx, ctx.user, {
    method: input.method === 'code' ? 'totp' : 'backup_code',
    during: 'console',
  })
  if (lockedUntil) throw lockedOut(lockedUntil, now)
  throw badRequest(
    'wrong_code',
    input.method === 'code'
      ? AUTH_ERROR_MESSAGES.INVALID_CODE
      : "That backup code didn't work. Each code works once.",
  )
}

/** "Confirm it's you" attempts and passkey options per person per minute, together. */
function hitConfirmLimit(ctx: Pick<AccessContext, 'rateLimiter' | 'user'>): void {
  const retryAfter = ctx.rateLimiter.hit(
    `console-confirm:${ctx.user.id}`,
    CONSOLE_CONFIRM_PER_MINUTE,
  )
  if (retryAfter > 0) {
    throw tooManyRequests('Too many attempts. Wait a minute and try again.', retryAfter)
  }
}

export async function confirm(
  ctx: AccessContext,
  input: ConfirmInput,
  now = new Date(),
): Promise<ConsoleStatus> {
  hitConfirmLimit(ctx)
  if (input.method === 'passkey') {
    if (await passkeysSwitchedOff(ctx.featureStore)) throw notFound()
    await verifyPasskey(ctx, input.response, now)
  } else {
    await verifyCode(ctx, input, now)
  }
  return openWindow(ctx, input.method, now)
}
