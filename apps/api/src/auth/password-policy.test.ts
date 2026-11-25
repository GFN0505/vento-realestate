import { describe, expect, it } from 'vitest'
import { checkPasswordPolicy } from './password-policy'

describe('checkPasswordPolicy', () => {
  it('names the first rule a password misses', () => {
    expect(checkPasswordPolicy('short1')).toBe('PASSWORD_TOO_SHORT')
    expect(checkPasswordPolicy('no-digits-at-all')).toBe('PASSWORD_NEEDS_NUMBER')
  })

  it('accepts 12 or more characters with a number, however ordinary', () => {
    expect(checkPasswordPolicy('Password2026')).toBeNull()
    expect(checkPasswordPolicy('Parkview-gate-2026')).toBeNull()
  })

  it('counts exactly 12 characters as long enough', () => {
    expect(checkPasswordPolicy('abcdefghijk1')).toBeNull()
    expect(checkPasswordPolicy('abcdefghij1')).toBe('PASSWORD_TOO_SHORT')
  })
})
