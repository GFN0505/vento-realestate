import { afterEach, describe, expect, it, vi } from 'vitest'
import { retryAfterHeader, toAuthFailure } from './auth-errors'

afterEach(() => {
  vi.useRealTimers()
})

describe('toAuthFailure', () => {
  it('waits until the lock ends when the account is locked', () => {
    const lockedUntil = '2026-11-25T09:45:00.000Z'
    const failure = toAuthFailure({ status: 429, code: 'ACCOUNT_LOCKED', lockedUntil }, 'two-step')

    expect(failure).toMatchObject({ kind: 'locked', lockedBy: 'codes' })
    expect(failure.until).toBe(Date.parse(lockedUntil))
  })

  it('blames passwords for a lock on the sign-in step', () => {
    const failure = toAuthFailure({ status: 429, code: 'ACCOUNT_LOCKED' }, 'sign-in')

    expect(failure.lockedBy).toBe('passwords')
    expect(failure.until).toBeGreaterThan(Date.now())
  })

  it('uses the retry header for a rate limit without a code', () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const failure = toAuthFailure({ status: 429, message: 'Too many requests' }, 'sign-in', 42)

    expect(failure).toMatchObject({ kind: 'rate-limited', until: 1_042_000 })
    expect(failure.message).toBe('Too many tries. Wait a minute and try again.')
  })

  it('marks a wrong email or password so the screen can offer a reset', () => {
    const failure = toAuthFailure({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }, 'sign-in')

    expect(failure).toMatchObject({ kind: 'wrong-password', until: null })
  })
})

describe('retryAfterHeader', () => {
  it('reads seconds from X-Retry-After and ignores junk', () => {
    expect(retryAfterHeader(new Headers({ 'X-Retry-After': '37' }))).toBe(37)
    expect(retryAfterHeader(new Headers({ 'X-Retry-After': 'soon' }))).toBeNull()
    expect(retryAfterHeader(new Headers())).toBeNull()
  })
})
