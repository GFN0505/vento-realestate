import { describe, expect, it } from 'vitest'
import { TEST_PASSWORD } from '@/test/factories'
import { checkPasswordPolicy } from './password-policy'

describe('checkPasswordPolicy', () => {
  it.each([
    ['Ab1!', 'PASSWORD_TOO_SHORT'],
    ['vento-test-2026!', 'PASSWORD_NEEDS_UPPERCASE'],
    ['VENTO-TEST-2026!', 'PASSWORD_NEEDS_LOWERCASE'],
    ['Vento-Test-abc!', 'PASSWORD_NEEDS_NUMBER'],
    ['VentoTest2026', 'PASSWORD_NEEDS_SPECIAL'],
  ])('refuses %s with %s', (password, code) => {
    expect(checkPasswordPolicy(password)).toBe(code)
  })

  it('names the first missing rule in display order', () => {
    expect(checkPasswordPolicy('abc')).toBe('PASSWORD_TOO_SHORT')
    expect(checkPasswordPolicy('abcdefgh')).toBe('PASSWORD_NEEDS_UPPERCASE')
    expect(checkPasswordPolicy('ABCDEFGH')).toBe('PASSWORD_NEEDS_LOWERCASE')
    expect(checkPasswordPolicy('Abcdefgh')).toBe('PASSWORD_NEEDS_NUMBER')
  })

  it('counts exactly 8 characters as long enough', () => {
    expect(checkPasswordPolicy('Abcde1!x')).toBeNull()
    expect(checkPasswordPolicy('Abcd1!x')).toBe('PASSWORD_TOO_SHORT')
  })

  it('accepts letters from any script and refuses a space as the special character', () => {
    expect(checkPasswordPolicy('Ọlọ́run-2026')).toBeNull()
    expect(checkPasswordPolicy('Vento Test 2026')).toBe('PASSWORD_NEEDS_SPECIAL')
  })

  it('accepts the password the tests and e2e fixtures sign in with', () => {
    expect(checkPasswordPolicy(TEST_PASSWORD)).toBeNull()
    expect(checkPasswordPolicy('Vento-Test-2026!')).toBeNull()
  })
})
