import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { COPY } from '@/lib/auth-errors'
import { NETWORK_ERROR } from '@/lib/error-copy'
import { confirmFailure, PASSKEY_FAILED } from './confirm-errors'

const wrongCode = new ORPCError('BAD_REQUEST', { data: { reason: 'wrong_code' } })

describe("what a refused 'Confirm it's you' says", () => {
  it('names the wrong code or backup code under the field', () => {
    expect(confirmFailure(wrongCode, 'code')).toEqual({
      message: COPY.wrongCode,
      onField: true,
      locked: false,
    })
    expect(confirmFailure(wrongCode, 'backup_code').message).toBe(COPY.wrongBackupCode)
  })

  it('says a passkey failed without counting it as a wrong code', () => {
    const error = new ORPCError('BAD_REQUEST', { data: { reason: 'passkey_failed' } })
    expect(confirmFailure(error, 'passkey')).toMatchObject({
      message: PASSKEY_FAILED,
      onField: false,
    })
  })

  it("shows the server's own reason when it sends one", () => {
    const message =
      "These backup codes were made with only your password, so they can't open the Vento console. Use your authenticator app or a passkey."
    const codes = new ORPCError('BAD_REQUEST', { message, data: { reason: 'wrong_code' } })
    expect(confirmFailure(codes, 'backup_code')).toMatchObject({ message, onField: true })
    const later =
      'This passkey was added after you last used a code. Use a code from your authenticator app this time.'
    const passkey = new ORPCError('BAD_REQUEST', {
      message: later,
      data: { reason: 'passkey_failed' },
    })
    expect(confirmFailure(passkey, 'passkey').message).toBe(later)
  })

  it('treats a long wait as the sign-in lock, with its time', () => {
    const now = Date.parse('2026-11-26T10:30:00Z')
    const error = new ORPCError('TOO_MANY_REQUESTS', { data: { retryAfterSeconds: 900 } })
    expect(confirmFailure(error, 'code', now)).toEqual({
      message: COPY.lockedCodes('11:45'),
      onField: false,
      locked: true,
    })
  })

  it('asks for a short wait on the per-minute limit', () => {
    const error = new ORPCError('TOO_MANY_REQUESTS', { data: { retryAfterSeconds: 40 } })
    expect(confirmFailure(error, 'code')).toMatchObject({
      message: COPY.tooManyRequests,
      locked: false,
    })
  })

  it('says the connection dropped', () => {
    expect(confirmFailure(new TypeError('Failed to fetch'), 'code').message).toBe(NETWORK_ERROR)
  })
})
