import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, CURRENT_TERMS_VERSION } from '@vento/shared'
import { and, eq, gt } from 'drizzle-orm'
import { verifications } from '@/db/schema'
import { checkPasswordPolicy } from '../password-policy'
import { recentPasswordHashes } from '../security-store'
import { type AuthDeps, authError } from './deps'

type Verify = (data: { hash: string; password: string }) => Promise<boolean>

/** Sign-up, reset, change and invitation acceptance all run the same rules. */
export async function assertPasswordAllowed(
  deps: AuthDeps,
  password: unknown,
  history?: { userId: string; verify: Verify },
): Promise<void> {
  if (typeof password !== 'string') return // Better Auth's own validation answers this
  const failure = await checkPasswordPolicy(password, deps.breachCheck)
  if (failure) throw authError('BAD_REQUEST', failure, AUTH_ERROR_MESSAGES[failure])
  if (!history) return
  const hashes = await recentPasswordHashes(deps.db, history.userId)
  for (const hash of hashes) {
    if (await history.verify({ hash, password })) {
      throw authError(
        'BAD_REQUEST',
        AUTH_ERROR_CODES.PASSWORD_REUSED,
        AUTH_ERROR_MESSAGES.PASSWORD_REUSED,
      )
    }
  }
}

export function assertTermsAccepted(termsVersion: unknown): void {
  if (termsVersion !== CURRENT_TERMS_VERSION) {
    throw authError(
      'BAD_REQUEST',
      AUTH_ERROR_CODES.TERMS_NOT_ACCEPTED,
      AUTH_ERROR_MESSAGES.TERMS_NOT_ACCEPTED,
    )
  }
}

/** The person a reset token belongs to (Better Auth stores it as `reset-password:<token>`). */
export async function userIdForResetToken(deps: AuthDeps, token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !token) return null
  const [row] = await deps.db
    .select({ value: verifications.value })
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, `reset-password:${token}`),
        gt(verifications.expiresAt, new Date()),
      ),
    )
  return row?.value ?? null
}
