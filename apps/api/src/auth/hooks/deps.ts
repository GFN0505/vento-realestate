import { APIError } from 'better-auth/api'
import type { Db, DbOrTx } from '@/db/client'
import type { EmailMessage, Mailer } from '@/email/mailer'
import { sendAll } from '@/email/mailer'
import type { RenderedEmail } from '@/email/templates/layout'
import { env } from '@/env'
import type { FeatureStore } from '@/platform/feature-store'

/** The server-only Better Auth calls the hooks make, typed narrowly. */
export type AuthServerApi = {
  createVerificationOTP(input: {
    body: { email: string; type: 'email-verification' }
  }): Promise<string>
  viewBackupCodes(input: { body: { userId: string } }): Promise<{ backupCodes: string[] }>
  /** With a live session: checks the code and returns, without a new session. */
  verifyTOTP(input: { body: { code: string }; headers: Headers }): Promise<unknown>
  /** With a live session and `disableSession`: checks and consumes the code. */
  verifyBackupCode(input: {
    body: { code: string; disableSession: true }
    headers: Headers
  }): Promise<unknown>
}

/** What the lock and failure counting need: also used by account.confirmPassword. */
export type LockDeps = { db: DbOrTx; mailer: Mailer }

export type AuthDeps = {
  db: Db
  mailer: Mailer
  /** Set once betterAuth() has returned; hooks only run after that. */
  api: () => AuthServerApi
  /** Availability snapshot (decision 0016), for `platform.passkeys`. */
  features: FeatureStore
}

/** A link on the web app (same origin as the API in production, proxied in development). */
export function webUrl(path: string): string {
  return new URL(path, env.WEB_ORIGIN).toString()
}

export async function sendEmail(
  deps: Pick<AuthDeps, 'mailer'>,
  to: string,
  tag: EmailMessage['tag'],
  email: RenderedEmail,
): Promise<void> {
  await sendAll(deps.mailer, [{ to, tag, ...email }])
}

/** Our own error shape on /api/auth: `{ code, message, ...extra }`, like Better Auth's. */
export function authError(
  status:
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'TOO_MANY_REQUESTS',
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): APIError {
  return new APIError(status, { code, message, ...extra })
}

/** The `code` of a Better Auth error response, if the endpoint failed. */
export function errorCode(returned: unknown): string | null {
  if (!(returned instanceof APIError)) return null
  const body = returned.body as { code?: unknown } | undefined
  return typeof body?.code === 'string' ? body.code : 'UNKNOWN'
}

/**
 * An error from an after-hook. Better Auth keeps the endpoint's own status for an APIError
 * thrown there (a failed sign-in stays 401), but passes a Response through unchanged, so
 * after-hooks that change the outcome (a lock) return one of these.
 */
export function errorResponse(
  status: 400 | 401 | 403 | 404 | 409 | 429,
  body: { code: string; message: string } & Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
