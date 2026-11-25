import { describe, expect, it } from 'vitest'
import { checkPasswordLocally } from './password-rules'
import { newPassword, termsVersion } from './password-schema'

describe('password rules', () => {
  it('ticks length and number separately', () => {
    expect(checkPasswordLocally('short1')).toEqual({ length: false, number: true })
    expect(checkPasswordLocally('longenoughpassword')).toEqual({ length: true, number: false })
    expect(checkPasswordLocally('Parkview-2026-keys')).toEqual({ length: true, number: true })
  })

  it('explains each missing rule in plain English', () => {
    const result = newPassword.safeParse('abc')
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Use at least 12 characters',
      'Include a number',
    ])
  })

  it('accepts a 12-character password with a number', () => {
    expect(newPassword.safeParse('lekkipearl12').success).toBe(true)
  })

  it('refuses passwords longer than 128 characters', () => {
    expect(newPassword.safeParse(`${'a'.repeat(128)}1`).success).toBe(false)
  })
})

describe('terms version', () => {
  it('accepts only the current version', () => {
    expect(termsVersion.safeParse('2026-11-25').success).toBe(true)
    expect(termsVersion.safeParse('2025-01-01').success).toBe(false)
  })
})
