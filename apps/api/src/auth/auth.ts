import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import {
  AUTH_BASE_PATH,
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  authSessionFields,
  authUserFields,
  MIN_PASSWORD_LENGTH,
  PASSWORD_MAX_LENGTH,
  REMEMBER_ME_HEADER,
} from '@vento/shared'
import { betterAuth } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { deleteSessionCookie, setSessionCookie } from 'better-auth/cookies'
import { emailOTP, twoFactor } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { accounts, passkeys, sessions, twoFactors, users, verifications } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { env } from '@/env'
import { CLIENT_IP_HEADER, maskIp } from '@/lib/client-ip'
import { logger } from '@/lib/logger'
import { lookupPlace } from '@/lib/place'
import { requestScope } from '@/lib/request-scope'
import { type FeatureStore, liveFeatureStore } from '@/platform/feature-store'
import { checkDevice } from './hooks/after-sign-in'
import { onBackupCodesRegenerated, onPasswordChanged, onTwoStepDisabled } from './hooks/audit-hooks'
import { type AuthDeps, type AuthServerApi, errorCode, errorResponse } from './hooks/deps'
import {
  afterPasskeyRegistration,
  afterPasskeySignIn,
  beforePasskeyAuthenticateOptions,
  beforePasskeyRegistration,
  type ChallengeContext,
  type HookSession,
  type PasskeySignInContext,
  readRememberMe,
  rememberChallenge,
  type SessionCookies,
} from './hooks/passkey-hooks'
import { assertPasswordAllowed, assertTermsAccepted } from './hooks/password-history'
import {
  assertNotLocked,
  lockedResponse,
  onPasswordFailure,
  onPasswordSuccess,
} from './hooks/sign-in-guard'
import { guardTurnOff } from './hooks/turn-off-guard'
import { afterTwoStepVerify, beforeTwoStepVerify } from './hooks/two-step-guard'
import {
  assertCanResendVerification,
  sendExistingAccountNotice,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from './hooks/verification'
import { defaultPasskeyName } from './passkey-names'
import {
  PERSISTENT_SESSION_SECONDS,
  PERSISTENT_THRESHOLD_MS,
  RESET_TOKEN_TTL_SECONDS,
  SESSION_MAX_MS,
  VERIFICATION_TTL_SECONDS,
} from './policy'
import {
  clearPasswordResetRequired,
  findUserById,
  rememberPasswordHash,
  userIdForResetToken,
} from './security-store'
import { webAuthnSettings } from './webauthn-settings'

/**
 * Better Auth routes we switch off: passwordless sign-ins that would skip two-step, and
 * session or account endpoints that duplicate our audited oRPC procedures (plan §4).
 */
export const DISABLED_AUTH_PATHS = [
  '/sign-in/email-otp',
  '/email-otp/send-verification-otp',
  '/email-otp/check-verification-otp',
  '/email-otp/request-password-reset',
  '/email-otp/reset-password',
  '/forget-password/email-otp',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
  '/change-email',
  '/delete-user',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
  // Our audited oRPC procedures replace these (plan question 2).
  '/passkey/list-user-passkeys',
  '/passkey/update-passkey',
  '/passkey/delete-passkey',
  // Names change through account.updateName, audited; nothing else here may be changed by the
  // person (image, company name) (plan question 1).
  '/update-user',
  // Unused, and dangerous while reachable: a signed-in guesser could try passwords without
  // counting towards the lock (/verify-password), and the right one shows the authenticator
  // secret (/two-factor/get-totp-uri). The secret is shown once, by /two-factor/enable.
  '/verify-password',
  '/two-factor/get-totp-uri',
  // Unused: sessions change only through our hooks and procedures; no social sign-in or linked
  // accounts (decision 0010).
  '/update-session',
  '/list-accounts',
  '/unlink-account',
  '/account-info',
  '/link-social',
  '/sign-in/social',
  '/get-access-token',
  '/refresh-token',
]

/** The passkey plugin's live endpoints, each limited to 10 a minute per IP. */
const PASSKEY_PATHS = [
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
] as const

/** Paths where a new session means someone just signed in and chose whether to be remembered. */
const SIGN_IN_PATHS = new Set([
  '/sign-in/email',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/passkey/verify-authentication',
])

/**
 * Sign-ins where a password was just typed: the session starts "confirmed" (5 minutes), so the
 * passkey offer right after doesn't ask again. Never a passkey sign-in: confirming is by password.
 */
const PASSWORD_SIGN_IN_PATHS = new Set([
  '/sign-in/email',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
])

/**
 * Sign-ins and set-ups that just proved a passkey, an authenticator code or a backup code: the
 * session records when (`second_factor_at`), so the Vento console can open without asking again.
 * A password alone never counts.
 */
export const SECOND_FACTOR_PATHS = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/passkey/verify-authentication',
])

/** Signed-in endpoints that check the password in the body: wrong ones count towards the lock. */
const PASSWORD_CHECKED_PATHS = new Set([
  '/change-password',
  '/two-factor/enable',
  '/two-factor/generate-backup-codes',
])

export type CreateAuthOptions = {
  db: Db
  mailer: Mailer
  /** Defaults to AUTH_RATE_LIMIT. */
  rateLimit?: boolean
  /** Availability for `platform.passkeys`; defaults to reading the database on every call. */
  features?: FeatureStore
}

function bodyField(body: unknown, key: string): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined
}

function bodyEmail(body: unknown): string | null {
  const value = bodyField(body, 'email')
  return typeof value === 'string' ? value.trim().toLowerCase() : null
}

function optionalDate(value: unknown): Date | null {
  return value instanceof Date || typeof value === 'string' ? new Date(value) : null
}

type HookContext = Parameters<typeof deleteSessionCookie>[0]

/** Drops a cookie already set on this response (Better Auth keeps them in two scopes). */
function dropPendingCookie(ctx: HookContext, name: string): void {
  const scoped = ctx as unknown as {
    responseHeaders?: Headers
    context: { responseHeaders?: Headers }
  }
  for (const headers of new Set([scoped.responseHeaders, scoped.context.responseHeaders])) {
    if (!headers) continue
    const kept = headers.getSetCookie().filter((c) => !c.startsWith(`${name}=`))
    headers.delete('set-cookie')
    for (const cookie of kept) headers.append('set-cookie', cookie)
  }
}

/** Better Auth's own cookie helpers for the passkey sign-in after-hook. */
function sessionCookies(ctx: HookContext): SessionCookies {
  return {
    drop: () => deleteSessionCookie(ctx),
    forBrowserSession: async () => {
      const created = ctx.context.newSession
      if (!created) return
      dropPendingCookie(ctx, ctx.context.authCookies.sessionToken.name)
      await setSessionCookie(ctx, created, true)
    },
  }
}

/** The session fields the passkey hooks read, from Better Auth's loosely typed session. */
function hookSession(
  found: { session: Record<string, unknown>; user: { id: string } } | null,
): HookSession | null {
  if (!found) return null
  const active = found.session.activeOrganizationId
  return {
    userId: found.user.id,
    activeOrganizationId: typeof active === 'string' ? active : null,
    reauthenticatedAt: optionalDate(found.session.reauthenticatedAt),
  }
}

export function createAuth(options: CreateAuthOptions) {
  const { db } = options
  let api: AuthServerApi | undefined
  const deps: AuthDeps = {
    db,
    mailer: options.mailer,
    api: () => {
      if (!api) throw new Error('Auth is not ready yet')
      return api
    },
    features: options.features ?? liveFeatureStore(db),
  }

  const webauthn = webAuthnSettings()
  const auth = betterAuth({
    appName: 'Vento',
    basePath: AUTH_BASE_PATH,
    baseURL: env.WEB_ORIGIN,
    trustedOrigins: [env.WEB_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications, twoFactors, passkeys },
      usePlural: true,
      transaction: true,
    }),
    disabledPaths: DISABLED_AUTH_PATHS,
    advanced: {
      // Leaves ids to Postgres: uuidv7() defaults on every table (decision 0012).
      database: { generateId: 'uuid' },
      cookiePrefix: 'vento',
      useSecureCookies: env.NODE_ENV === 'production',
      // Set by our middleware from the socket or a trusted proxy; client values are stripped.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Our before-hook applies the full rules first; these are Better Auth's own backstop.
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: (data) => sendResetPasswordEmail(deps, data),
      onPasswordReset: async ({ user }) => {
        // A new password through the emailed link is what lifts a two-step reset's sign-in block.
        await clearPasswordResetRequired(db, user.id)
        const identity = await findUserById(db, user.id)
        if (identity) await onPasswordChanged(deps, identity, 'reset')
      },
      onExistingUserSignUp: ({ user }) => sendExistingAccountNotice(deps, user),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: VERIFICATION_TTL_SECONDS,
      autoSignInAfterVerification: true,
      sendVerificationEmail: (data) => sendVerificationEmail(deps, data),
    },
    user: { additionalFields: authUserFields },
    session: {
      expiresIn: PERSISTENT_SESSION_SECONDS,
      // "Keep me signed in" lasts 30 days from sign-in; the idle rule is in session-policy.ts.
      disableSessionRefresh: true,
      // Off so a revoked or expired session fails on its very next request.
      cookieCache: { enabled: false },
      // Our own 5-minute "Confirm it's you" replaces it. With the default (1 day) the passkey
      // plugin's freshness check would stop anyone with an older "Keep me signed in" session
      // from adding a passkey. Otherwise it's read only by /delete-user, which is switched off.
      freshAge: 0,
      additionalFields: authSessionFields,
    },
    rateLimit: {
      enabled: options.rateLimit ?? env.AUTH_RATE_LIMIT === 'on',
      // Memory, not the database: Better Auth keys rows by the full client IP, which we never
      // store. Fine for one API instance; several instances need Redis (secondary storage).
      storage: 'memory',
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
        ...Object.fromEntries(PASSKEY_PATHS.map((path) => [path, { window: 60, max: 10 }])),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              termsAcceptedAt: user.termsVersion ? new Date() : null,
            },
          }),
        },
      },
      account: {
        create: {
          after: async (account) => {
            if (account.password) await rememberPasswordHash(db, account.userId, account.password)
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const now = Date.now()
            const path = ctx?.path ?? ''
            // A rotated session (two-step turned on or off, a password change) carries its old
            // kind over, with its place, entry time and confirmation.
            const rotated = typeof session.persistent === 'boolean'
            const persistent = rotated
              ? Boolean(session.persistent)
              : path === '/passkey/verify-authentication'
                ? // The plugin ignores "Keep me signed in"; the web sends it as a header.
                  requestScope().auth.rememberMe === true
                : SIGN_IN_PATHS.has(path) &&
                  session.expiresAt.getTime() - now > PERSISTENT_THRESHOLD_MS
            let activeOrganizationId = session.activeOrganizationId ?? null
            if (!rotated) {
              const [user] = await db
                .select({ lastActiveOrganizationId: users.lastActiveOrganizationId })
                .from(users)
                .where(eq(users.id, session.userId))
              activeOrganizationId = user?.lastActiveOrganizationId ?? null
            }
            // Changing the password makes a fresh session (not a rotation), so its proof comes
            // from the session that made the request.
            const previous: Record<string, unknown> | null = rotated
              ? session
              : path === '/change-password'
                ? (ctx?.context.session?.session ?? null)
                : null
            const secondFactorAt = SECOND_FACTOR_PATHS.has(path)
              ? new Date(now)
              : optionalDate(previous?.secondFactorAt)
            return {
              data: {
                ...session,
                // A rotated session keeps its proof but never the console window: re-prove it.
                secondFactorAt,
                consoleOpenedAt: null,
                consoleActiveAt: null,
                persistent,
                expiresAt: persistent ? session.expiresAt : new Date(now + SESSION_MAX_MS),
                lastActiveAt: new Date(now),
                activeOrganizationId,
                ipAddress: rotated ? session.ipAddress : maskIp(session.ipAddress),
                ...(rotated
                  ? {}
                  : {
                      // Looked up from the full address held in memory for this request only.
                      place: lookupPlace(requestScope().ip),
                      organizationEnteredAt: new Date(now),
                      reauthenticatedAt: PASSWORD_SIGN_IN_PATHS.has(path) ? new Date(now) : null,
                    }),
              },
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        switch (ctx.path) {
          case '/sign-up/email':
            assertTermsAccepted(bodyField(ctx.body, 'termsVersion'))
            await assertPasswordAllowed(deps, bodyField(ctx.body, 'password'))
            return
          case '/reset-password': {
            const userId = await userIdForResetToken(db, bodyField(ctx.body, 'token'))
            await assertPasswordAllowed(
              deps,
              bodyField(ctx.body, 'newPassword'),
              userId ? { userId, verify: ctx.context.password.verify } : undefined,
            )
            return
          }
          case '/change-password': {
            const session = await getSessionFromCtx(ctx)
            if (session) await assertNotLocked(deps, session.user.email)
            await assertPasswordAllowed(
              deps,
              bodyField(ctx.body, 'newPassword'),
              session
                ? { userId: session.user.id, verify: ctx.context.password.verify }
                : undefined,
            )
            // A changed password always signs out every other device, whatever the client asks.
            return { context: { body: { ...(ctx.body as object), revokeOtherSessions: true } } }
          }
          case '/two-factor/enable':
          case '/two-factor/generate-backup-codes': {
            // A locked account can't confirm anything with a password (plan question 11).
            const session = await getSessionFromCtx(ctx)
            if (session) await assertNotLocked(deps, session.user.email)
            return
          }
          case '/passkey/generate-register-options':
            await beforePasskeyRegistration(
              deps,
              hookSession(await getSessionFromCtx(ctx)),
              'options',
            )
            return
          case '/passkey/verify-registration': {
            await beforePasskeyRegistration(
              deps,
              hookSession(await getSessionFromCtx(ctx)),
              'verify',
            )
            // A client-chosen name would win over ours; it's renamed afterwards if wanted. Blank,
            // not removed: Better Auth merges hook changes into the body and skips undefined.
            // Never a second session: one made here would skip our sign-in checks and audit.
            return {
              context: { body: { ...(ctx.body as object), name: '', createSession: false } },
            }
          }
          case '/passkey/generate-authenticate-options':
            await beforePasskeyAuthenticateOptions(deps)
            return
          case '/passkey/verify-authentication':
            // No lock check: a passkey can't be guessed (spec decision 8).
            readRememberMe(ctx.headers?.get(REMEMBER_ME_HEADER))
            await rememberChallenge(ctx as unknown as ChallengeContext)
            return
          case '/sign-in/email': {
            const email = bodyEmail(ctx.body)
            if (email) await assertNotLocked(deps, email)
            return
          }
          case '/send-verification-email':
            await assertCanResendVerification(deps, bodyEmail(ctx.body))
            return
          case '/two-factor/disable': {
            const session = await getSessionFromCtx(ctx)
            const user = session ? await findUserById(db, session.user.id) : null
            if (!user) return
            await assertNotLocked(deps, user.email)
            await guardTurnOff(deps, {
              user,
              body: ctx.body,
              headers: ctx.headers ?? new Headers(),
              verify: ctx.context.password.verify,
            })
            return
          }
          case '/two-factor/verify-totp':
          case '/two-factor/verify-backup-code': {
            // Our turn-off guard is calling the verifier itself and keeps the books.
            if (requestScope().auth.twoStepMode === 'in_place') return
            const session = await getSessionFromCtx(ctx)
            const sessionUser = session ? await findUserById(db, session.user.id) : null
            let pendingUserId: string | null = null
            if (!sessionUser) {
              // Same lookup the plugin makes: the signed two_factor cookie names a verification row.
              const cookie = ctx.context.createAuthCookie('two_factor')
              const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
              const row = identifier
                ? await ctx.context.internalAdapter.findVerificationValue(identifier)
                : null
              pendingUserId = row && row.expiresAt > new Date() ? row.value : null
            }
            await beforeTwoStepVerify(deps, { sessionUser, pendingUserId })
            // "Trust this device" is not offered (spec departures), whatever a client sends.
            return { context: { body: { ...(ctx.body as object), trustDevice: false } } }
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned
        const code = errorCode(returned)
        switch (ctx.path) {
          case '/sign-in/email': {
            const email = bodyEmail(ctx.body)
            if (code === AUTH_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD && email) {
              const lockedUntil = await onPasswordFailure(deps, email)
              return lockedUntil ? lockedResponse(lockedUntil) : undefined
            }
            const signedIn = ctx.context.newSession
            const user = !code && signedIn ? await findUserById(db, signedIn.user.id) : null
            if (!user || !signedIn) return
            // Checked only after a correct password, so it reveals nothing to a guesser.
            if (user.passwordResetRequired) {
              await db.delete(sessions).where(eq(sessions.token, signedIn.session.token))
              // Stops the two-step plugin's after-hook from turning this into a code challenge.
              ctx.context.setNewSession(null)
              return errorResponse(403, {
                code: AUTH_ERROR_CODES.PASSWORD_RESET_REQUIRED,
                message: AUTH_ERROR_MESSAGES.PASSWORD_RESET_REQUIRED,
              })
            }
            await onPasswordSuccess(deps, ctx, user)
            return
          }
          case '/two-factor/verify-totp':
          case '/two-factor/verify-backup-code':
            if (requestScope().auth.twoStepMode === 'in_place') return
            return afterTwoStepVerify(deps, ctx, {
              method: ctx.path === '/two-factor/verify-totp' ? 'totp' : 'backup_code',
              returned,
            })
          case '/passkey/verify-authentication':
            return afterPasskeySignIn(
              deps,
              ctx as unknown as PasskeySignInContext,
              sessionCookies(ctx),
              bodyField(ctx.body, 'response'),
            )
          case '/passkey/verify-registration':
            return afterPasskeyRegistration(deps, ctx.context.session?.user.id, returned)
          case '/verify-email':
          case '/email-otp/verify-email': {
            // Sign-up's automatic sign-in: remember the browser, but nothing to announce.
            const signedIn = ctx.context.newSession
            const user = !code && signedIn ? await findUserById(db, signedIn.user.id) : null
            if (user) await checkDevice(deps, ctx, user, { alert: false })
            return
          }
        }
        if (!PASSWORD_CHECKED_PATHS.has(ctx.path) && ctx.path !== '/two-factor/disable') return
        const sessionUserId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id
        const user = sessionUserId ? await findUserById(db, sessionUserId) : null
        if (!user) return
        if (code === AUTH_ERROR_CODES.INVALID_PASSWORD && PASSWORD_CHECKED_PATHS.has(ctx.path)) {
          // Counts towards the 10-in-15-minutes lock; this session carries on (plan question 11).
          const lockedUntil = await onPasswordFailure(deps, user.email)
          return lockedUntil ? lockedResponse(lockedUntil) : undefined
        }
        if (code) return
        if (PASSWORD_CHECKED_PATHS.has(ctx.path)) {
          // The password was just proven: the 5-minute "Confirm it's you" window opens.
          const current = ctx.context.newSession?.session.id ?? ctx.context.session?.session.id
          if (current) {
            await db
              .update(sessions)
              .set({ reauthenticatedAt: new Date() })
              .where(eq(sessions.id, current))
          }
        }
        switch (ctx.path) {
          case '/change-password':
            await onPasswordChanged(deps, user, 'change')
            return
          case '/two-factor/disable':
            await onTwoStepDisabled(deps, user)
            return
          case '/two-factor/generate-backup-codes':
            await onBackupCodesRegenerated(deps, user)
            return
        }
      }),
    },
    plugins: [
      // Only used to put a 6-digit code in the verification email; its sending routes are off.
      emailOTP({
        otpLength: 6,
        expiresIn: VERIFICATION_TTL_SECONDS,
        allowedAttempts: 5,
        sendVerificationOnSignUp: false,
        storeOTP: 'encrypted',
        sendVerificationOTP: async () => {
          logger.warn('emailOTP tried to send on its own; its routes should be disabled')
        },
      }),
      twoFactor({
        issuer: 'Vento',
        backupCodeOptions: { amount: 10, length: 10 },
        accountLockout: { maxFailedAttempts: 5, durationSeconds: 900 },
        twoFactorCookieMaxAge: 600,
      }),
      // Decision 0019: bound to the web app's own host; every passkey must check the person
      // (user verification) and be findable without an email (resident key).
      passkey({
        rpID: webauthn.rpID,
        rpName: webauthn.rpName,
        origin: webauthn.origin,
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: webauthn.userVerification,
        },
        registration: {
          requireSession: true,
          afterVerification: ({ verification }) => ({
            name: defaultPasskeyName(
              verification.registrationInfo?.aaguid,
              requestScope().userAgent,
            ),
          }),
        },
        advanced: { webAuthnChallengeCookie: 'passkey_challenge' },
      }),
    ],
  })

  api = auth.api
  return auth
}

export type Auth = ReturnType<typeof createAuth>
