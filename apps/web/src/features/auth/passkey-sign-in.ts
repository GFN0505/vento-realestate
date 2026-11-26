import { AUTH_ERROR_MESSAGES, AUTH_ERROR_CODES as C, REMEMBER_ME_HEADER } from '@vento/shared'
import { COPY, NETWORK_ERROR } from '@/lib/auth-errors'

/*
 * Sign in with a passkey (spec J-ONB-04), for the sign-in page and the Session expired dialog.
 * The WebAuthn library loads only when this runs. No two-step code follows: a passkey counts as
 * two-step (decision 0019).
 */

export type PasskeySignInResult =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string; code: string | undefined }

export const PASSKEY_CANCELLED = 'Passkey sign-in was cancelled.'
const TIMED_OUT = 'That took too long. Try again.'

type Options = {
  /** Offer saved passkeys in the email field's suggestions instead of a prompt. */
  autoFill?: boolean
  /** Read when the request leaves, so ticking "Keep me signed in" after autofill started counts. */
  keepSignedIn: () => boolean
}

export function passkeySignInMessage(error: { code?: string; status: number }): string {
  if (!error.status) return NETWORK_ERROR
  switch (error.code) {
    case C.PASSKEY_NOT_FOUND:
    case C.PASSKEY_NOT_RECOGNISED:
    case C.AUTHENTICATION_FAILED:
      return AUTH_ERROR_MESSAGES.PASSKEY_NOT_RECOGNISED
    case C.PASSKEYS_UNAVAILABLE:
      return AUTH_ERROR_MESSAGES.PASSKEYS_UNAVAILABLE
    case C.PASSWORD_RESET_REQUIRED:
      return AUTH_ERROR_MESSAGES.PASSWORD_RESET_REQUIRED
    case C.CHALLENGE_NOT_FOUND:
      return TIMED_OUT
  }
  if (error.status === 429) return COPY.tooManyRequests
  return AUTH_ERROR_MESSAGES.PASSKEY_NOT_RECOGNISED
}

const codeOf = (error: object): string | undefined =>
  'code' in error && typeof error.code === 'string' ? error.code : undefined

export async function signInWithPasskey({
  autoFill = false,
  keepSignedIn,
}: Options): Promise<PasskeySignInResult> {
  try {
    const { passkeyAuth, isPasskeyCancel } = await import('@/lib/passkey-client')
    const { error } = await passkeyAuth.signIn.passkey({
      autoFill,
      fetchOptions: {
        // The plugin ignores "remember me"; the server reads this header instead (plan §4.5).
        onRequest(context) {
          context.headers.set(REMEMBER_ME_HEADER, keepSignedIn() ? '1' : '0')
        },
      },
    })
    if (!error) return { status: 'signed-in' }
    const code = codeOf(error)
    if (isPasskeyCancel(code)) return { status: 'cancelled' }
    return { status: 'error', message: passkeySignInMessage({ code, status: error.status }), code }
  } catch {
    return { status: 'error', message: NETWORK_ERROR, code: undefined }
  }
}
