import { describe, expect, it } from 'vitest'
import { checkPasswordLocally, unmetPasswordRules } from './password-rules'
import { newPassword, termsVersion } from './password-schema'

describe('password rules', () => {
  it('passes a password that meets every rule', () => {
    expect(checkPasswordLocally('Vento-Test-2026!')).toEqual({
      length: true,
      uppercase: true,
      lowercase: true,
      number: true,
      special: true,
    })
    expect(unmetPasswordRules('Vento-Test-2026!')).toEqual([])
  })

  it('lists every missing rule in display order', () => {
    expect(unmetPasswordRules('')).toEqual([
      'length',
      'uppercase',
      'lowercase',
      'number',
      'special',
    ])
    expect(unmetPasswordRules('abc')).toEqual(['length', 'uppercase', 'number', 'special'])
  })

  it('counts 8 characters as long enough and 7 as too short', () => {
    expect(unmetPasswordRules('Abcde1!x')).toEqual([])
    expect(unmetPasswordRules('Abcd1!x')).toEqual(['length'])
  })

  it('counts an emoji as one character', () => {
    expect(unmetPasswordRules('Abcd1!🙂')).toEqual(['length'])
  })

  it.each([
    ['uppercase', 'vento-test-2026!'],
    ['lowercase', 'VENTO-TEST-2026!'],
    ['number', 'Vento-Test-abc!'],
    ['special', 'VentoTest2026'],
  ])('flags a missing %s', (rule, password) => {
    expect(unmetPasswordRules(password)).toEqual([rule])
  })

  it('accepts uppercase and lowercase letters from any script', () => {
    expect(unmetPasswordRules('Ọlọ́run-2026')).toEqual([])
    expect(unmetPasswordRules('ÄÖÜäöü-2026')).toEqual([])
    expect(checkPasswordLocally('ọ').uppercase).toBe(false)
    expect(checkPasswordLocally('Ọ').uppercase).toBe(true)
  })

  it('accepts digits from any script as a number', () => {
    expect(checkPasswordLocally('٣').number).toBe(true)
  })

  it("doesn't count a space as a special character", () => {
    expect(unmetPasswordRules('Vento Test 2026')).toEqual(['special'])
  })
})

describe('newPassword schema', () => {
  it('explains each missing rule in plain English', () => {
    const result = newPassword.safeParse('abc')
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Use at least 8 characters',
      'Add an uppercase letter',
      'Add a number',
      'Add a special character, like ! @ # ?',
    ])
  })

  it('accepts an 8-character password that meets every rule', () => {
    expect(newPassword.safeParse('Lekki#26').success).toBe(true)
  })

  it('refuses passwords longer than 128 characters', () => {
    expect(newPassword.safeParse(`Aa1!${'a'.repeat(125)}`).success).toBe(false)
  })
})

describe('terms version', () => {
  it('accepts only the current version', () => {
    expect(termsVersion.safeParse('2026-11-25').success).toBe(true)
    expect(termsVersion.safeParse('2025-01-01').success).toBe(false)
  })
})

describe('special character rule and accents', () => {
  it('does not count a combining accent mark as a special character', () => {
    expect(checkPasswordLocally('Ọ\u0301laoluwa2026').special).toBe(false)
  })
})
