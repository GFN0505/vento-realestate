import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import {
  AUTH_BASE_PATH,
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  authSessionFields,
  authUserFields,
} from '@vento/shared'
import { betterAuth } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { emailOTP, twoFactor } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { accounts, sessions, twoFactors, users, verifications } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { env } from '@/env'
import { CLIENT_IP_HEADER, maskIp } from '@/lib/client-ip'
import { logger } from '@/lib/logger'
import { onBackupCodesRegenerated, onPasswordChanged, onTwoStepDisabled } from './hooks/audit-hooks'
import {
  type AuthDeps,
  type AuthServerApi,
  authError,
  errorCode,
  errorResponse,
} from './hooks/deps'
import { assertPasswordAllowed, assertTermsAccepted } from './hooks/password-history'
import {
  assertNotLocked,
  lockedResponse,
  onPasswordFailure,
  onPasswordSuccess,
} from './hooks/sign-in-guard'
import { afterTwoStepVerify, beforeTwoStepVerify } from './hooks/two-step-guard'
import {
  assertCanResendVerification,
  sendExistingAccountNotice,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from './hooks/verification'
import { type BreachCheck, defaultBreachCheck } from './password-policy'
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
  roleRequiresTwoStep,
  userIdForResetToken,
} from './security-store'

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
]

/** Paths where a new session means someone just signed in and chose whether to be remembered. */
const SIGN_IN_PATHS = new Set([
  '/sign-in/email',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
])

export type CreateAuthOptions = {
  db: Db
  mailer: Mailer
  /** null turns the breach check off (tests, CI). Defaults to PWNED_PASSWORDS_CHECK. */
  breachCheck?: BreachCheck | null
  /** Defaults to AUTH_RATE_LIMIT. */
  rateLimit?: boolean
}

function bodyField(body: unknown, key: string): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined
}

function bodyEmail(body: unknown): string | null {
  const value = bodyField(body, 'email')
  return typeof value === 'string' ? value.trim().toLowerCase() : null
}

export function createAuth(options: CreateAuthOptions) {
  const { db } = options
  let api: AuthServerApi | undefined
  const deps: AuthDeps = {
    db,
    mailer: options.mailer,
    breachCheck: options.breachCheck !== undefined ? options.breachCheck : defaultBreachCheck(),
    api: () => {
      if (!api) throw new Error('Auth is not ready yet')
      return api
    },
  }

  const auth = betterAuth({
    appName: 'Vento',
    basePath: AUTH_BASE_PATH,
    baseURL: env.WEB_ORIGIN,
    trustedOrigins: [env.WEB_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications, twoFactors },
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
      minPasswordLength: 12,
      maxPasswordLength: 128,
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
            // A rotated session (two-step turned on or off) carries its old kind over.
            const rotated = typeof session.persistent === 'boolean'
            const persistent = rotated
              ? Boolean(session.persistent)
              : SIGN_IN_PATHS.has(ctx?.path ?? '') &&
                session.expiresAt.getTime() - now > PERSISTENT_THRESHOLD_MS
            let activeOrganizationId = session.activeOrganizationId ?? null
            if (!rotated) {
              const [user] = await db
                .select({ lastActiveOrganizationId: users.lastActiveOrganizationId })
                .from(users)
                .where(eq(users.id, session.userId))
              activeOrganizationId = user?.lastActiveOrganizationId ?? null
            }
            return {
              data: {
                ...session,
                persistent,
                expiresAt: persistent ? session.expiresAt : new Date(now + SESSION_MAX_MS),
                lastActiveAt: new Date(now),
                activeOrganizationId,
                ipAddress: rotated ? session.ipAddress : maskIp(session.ipAddress),
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
          case '/update-user':
            // Terms are accepted once, at sign-up, where the time is recorded.
            if (bodyField(ctx.body, 'termsVersion') !== undefined) {
              throw authError(
                'BAD_REQUEST',
                'FIELD_NOT_ALLOWED',
                'The terms version is set at sign-up',
              )
            }
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
            if (session && (await roleRequiresTwoStep(db, session.user.id))) {
              throw authError(
                'FORBIDDEN',
                AUTH_ERROR_CODES.TWO_STEP_REQUIRED_BY_ROLE,
                AUTH_ERROR_MESSAGES.TWO_STEP_REQUIRED_BY_ROLE,
              )
            }
            return
          }
          case '/two-factor/verify-totp':
          case '/two-factor/verify-backup-code': {
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
            await onPasswordSuccess(deps, user)
            return
          }
          case '/two-factor/verify-totp':
            return afterTwoStepVerify(deps, { method: 'totp', returned })
          case '/two-factor/verify-backup-code':
            return afterTwoStepVerify(deps, { method: 'backup_code', returned })
        }
        if (code) return
        const sessionUserId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id
        const user = sessionUserId ? await findUserById(db, sessionUserId) : null
        if (!user) return
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
    ],
  })

  api = auth.api
  return auth
}

export type Auth = ReturnType<typeof createAuth>
