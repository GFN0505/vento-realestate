import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, CURRENT_TERMS_VERSION } from '@vento/shared'
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
