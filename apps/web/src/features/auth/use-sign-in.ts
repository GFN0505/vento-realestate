import { AUTH_ERROR_CODES } from '@vento/shared'
import { authClient } from '@/lib/auth-client'
import {
  type AuthFailure,
  authErrorMessage,
  retryAfterHeader,
  toAuthFailure,
} from '@/lib/auth-errors'

export type SignInResult =
  | { status: 'signed-in' }
  | { status: 'two-step' }
  | { status: 'unverified' }
  | { status: 'error'; failure: AuthFailure }

export type CodeResult =
  | { status: 'signed-in' }
  | { status: 'restart'; message: string }
  | { status: 'error'; failure: AuthFailure }

/** The per-IP limiter only says how long to wait in a header, so read it off the response. */
function captureRetryAfter() {
  let seconds: number | null = null
  const fetchOptions = {
    onError: (context: { response: Response }) => {
      seconds = retryAfterHeader(context.response.headers)
    },
  }
  return { fetchOptions, retryAfter: () => seconds }
}

/** Step 1: email and password. Better Auth answers with a two-step challenge when it's on. */
export async function signInWithPassword(input: {
  email: string
  password: string
  keepSignedIn: boolean
}): Promise<SignInResult> {
  const retry = captureRetryAfter()
  const { data, error } = await authClient.signIn.email({
    email: input.email.trim(),
    password: input.password,
    rememberMe: input.keepSignedIn,
    fetchOptions: retry.fetchOptions,
  })
  if (error) {
    if (error.code === AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED) return { status: 'unverified' }
    return { status: 'error', failure: toAuthFailure(error, 'sign-in', retry.retryAfter()) }
  }
  if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return { status: 'two-step' }
  return { status: 'signed-in' }
}

/** Step 2: the authenticator code, or one backup code. "Trust this device" is never sent. */
export async function verifySignInCode(kind: 'totp' | 'backup', code: string): Promise<CodeResult> {
  const retry = captureRetryAfter()
  const { error } =
    kind === 'totp'
      ? await authClient.twoFactor.verifyTotp({ code, fetchOptions: retry.fetchOptions })
      : await authClient.twoFactor.verifyBackupCode({
          code: code.trim(),
          fetchOptions: retry.fetchOptions,
        })
  if (!error) return { status: 'signed-in' }
  if (error.code === AUTH_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE) {
    return { status: 'restart', message: authErrorMessage(error, 'two-step') }
  }
  const step = kind === 'totp' ? 'two-step' : 'backup-code'
  return { status: 'error', failure: toAuthFailure(error, step, retry.retryAfter()) }
}
