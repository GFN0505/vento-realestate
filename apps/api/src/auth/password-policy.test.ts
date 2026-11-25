import { describe, expect, it, vi } from 'vitest'
import { checkPasswordPolicy, checkPwnedPasswords, isCommonPassword } from './password-policy'

describe('checkPasswordPolicy', () => {
  it('names the first rule a password misses', async () => {
    expect(await checkPasswordPolicy('short1', null)).toBe('PASSWORD_TOO_SHORT')
    expect(await checkPasswordPolicy('no-digits-at-all', null)).toBe('PASSWORD_NEEDS_NUMBER')
    expect(await checkPasswordPolicy('Password2026!', null)).toBe('PASSWORD_TOO_COMMON')
  })

  it('refuses a password the breach check reports as leaked', async () => {
    const breached = vi.fn(async () => true)
    expect(await checkPasswordPolicy('Lekki-pearl-77', breached)).toBe('PASSWORD_BREACHED')
  })

  it('accepts when the breach check is unavailable (fails open)', async () => {
    expect(await checkPasswordPolicy('Lekki-pearl-77', async () => 'unknown')).toBeNull()
  })
})

describe('isCommonPassword', () => {
  it('catches common words padded with digits and symbols', () => {
    expect(isCommonPassword('sunshine12345')).toBe(true)
    expect(isCommonPassword('QWERTY123456')).toBe(true)
  })

  it('catches digit-only and repetitive passwords', () => {
    expect(isCommonPassword('123456789012')).toBe(true)
    expect(isCommonPassword('aaaaaaaaaaa1')).toBe(true)
  })

  it('lets an unusual passphrase through', () => {
    expect(isCommonPassword('Parkview-gate-2026')).toBe(false)
  })
})

describe('checkPwnedPasswords', () => {
  it('sends only the 5-character hash prefix and matches the suffix', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetchMock = vi.fn(
      async (_url: string) => new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n'),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await checkPwnedPasswords('password')).toBe(true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.pwnedpasswords.com/range/5BAA6')
    vi.unstubAllGlobals()
  })

  it("answers 'unknown' when the service is down", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
    )
    expect(await checkPwnedPasswords('anything-1234')).toBe('unknown')
    vi.unstubAllGlobals()
  })
})
