import { AUTH_ERROR_CODES } from '@vento/shared'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage, isLocked } from '@/lib/auth-errors'

export type SignInResult =
  | { status: 'signed-in' }
  | { status: 'two-step' }
  | { status: 'unverified' }
  | { status: 'error'; message: string; locked: boolean }

export type CodeResult =
  | { status: 'signed-in' }
  | { status: 'restart'; message: string }
  | { status: 'error'; message: string; locked: boolean }

function failure(error: AuthClientError, step: Parameters<typeof authErrorMessage>[1]) {
  return {
    status: 'error',
    message: authErrorMessage(error, step),
    locked: isLocked(error),
  } as const
}

/** Step 1: email and password. Better Auth answers with a two-step challenge when it's on. */
export async function signInWithPassword(input: {
  email: string
  password: string
  keepSignedIn: boolean
}): Promise<SignInResult> {
  const { data, error } = await authClient.signIn.email({
    email: input.email.trim(),
    password: input.password,
    rememberMe: input.keepSignedIn,
  })
  if (error) {
    if (error.code === AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED) return { status: 'unverified' }
    return failure(error, 'sign-in')
  }
  if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return { status: 'two-step' }
  return { status: 'signed-in' }
}

/** Step 2: the authenticator code, or one backup code. "Trust this device" is never sent. */
export async function verifySignInCode(kind: 'totp' | 'backup', code: string): Promise<CodeResult> {
  const { error } =
    kind === 'totp'
      ? await authClient.twoFactor.verifyTotp({ code })
      : await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
  if (!error) return { status: 'signed-in' }
  if (error.code === AUTH_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE) {
    return { status: 'restart', message: authErrorMessage(error, 'two-step') }
  }
  return failure(error, kind === 'totp' ? 'two-step' : 'backup-code')
}
