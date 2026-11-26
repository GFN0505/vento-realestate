import { AUTH_ERROR_MESSAGES } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { NETWORK_ERROR } from '@/lib/error-copy'
import { passkeySignInMessage, passkeySignInResult } from './passkey-sign-in'

const isCancel = (code?: string) => code === 'AUTH_CANCELLED' || code === 'ERROR_CEREMONY_ABORTED'

describe('passkey sign-in answers', () => {
  it('reads a removed or unknown passkey the same way', () => {
    const copy = AUTH_ERROR_MESSAGES.PASSKEY_NOT_RECOGNISED
    expect(passkeySignInMessage({ code: 'PASSKEY_NOT_FOUND', status: 401 })).toBe(copy)
    expect(passkeySignInMessage({ code: 'PASSKEY_NOT_RECOGNISED', status: 401 })).toBe(copy)
    expect(passkeySignInMessage({ code: 'AUTHENTICATION_FAILED', status: 400 })).toBe(copy)
  })

  it('names the reset, the kill switch and a stale challenge', () => {
    expect(passkeySignInMessage({ code: 'PASSWORD_RESET_REQUIRED', status: 403 })).toBe(
      AUTH_ERROR_MESSAGES.PASSWORD_RESET_REQUIRED,
    )
    expect(passkeySignInMessage({ code: 'PASSKEYS_UNAVAILABLE', status: 404 })).toBe(
      AUTH_ERROR_MESSAGES.PASSKEYS_UNAVAILABLE,
    )
    expect(passkeySignInMessage({ code: 'CHALLENGE_NOT_FOUND', status: 400 })).toBe(
      'That took too long. Try again.',
    )
  })

  it('treats a closed prompt as cancelled, quietly', () => {
    expect(
      passkeySignInResult({ code: 'ERROR_CEREMONY_ABORTED', status: 400 }, isCancel, false),
    ).toEqual({
      status: 'cancelled',
    })
  })

  it('says the connection failed, not "cancelled", when offline', () => {
    expect(passkeySignInResult({ code: 'AUTH_CANCELLED', status: 400 }, isCancel, true)).toEqual({
      status: 'error',
      message: NETWORK_ERROR,
      code: 'AUTH_CANCELLED',
    })
  })

  it('signs in when there is no error', () => {
    expect(passkeySignInResult(null, isCancel, false)).toEqual({ status: 'signed-in' })
  })
})
