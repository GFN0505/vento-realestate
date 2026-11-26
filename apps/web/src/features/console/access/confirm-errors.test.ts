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
