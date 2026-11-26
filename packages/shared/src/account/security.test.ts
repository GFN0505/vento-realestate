import { describe, expect, it } from 'vitest'
import { updateOrganizationInput } from '../organization/schema'
import { accountName, confirmPasswordInput, passkeyName, renamePasskeyInput } from './security'

describe('your name', () => {
  it('trims and accepts 2 to 80 characters', () => {
    expect(accountName.parse('  Aisha Bello ')).toBe('Aisha Bello')
    expect(accountName.safeParse('A'.repeat(80)).success).toBe(true)
  })

  it('says "Enter your name" when too short or blank', () => {
    const result = accountName.safeParse('  A ')
    expect(result.error?.issues[0]?.message).toBe('Enter your name')
  })

  it('refuses more than 80 characters and hidden characters', () => {
    expect(accountName.safeParse('A'.repeat(81)).success).toBe(false)
    expect(accountName.safeParse('Aisha‮Bello').success).toBe(false)
  })
})

describe('passkey name', () => {
  it('trims and accepts 1 to 40 characters', () => {
    expect(passkeyName.parse(' iPhone ')).toBe('iPhone')
    expect(passkeyName.safeParse('x'.repeat(41)).success).toBe(false)
  })

  it('says "Enter a name" when blank', () => {
    expect(passkeyName.safeParse('   ').error?.issues[0]?.message).toBe('Enter a name')
  })

  it('takes nothing but the id and the name on rename', () => {
    const id = '019a0000-0000-7000-8000-000000000001'
    expect(renamePasskeyInput.safeParse({ id, name: 'Mac', userId: id }).success).toBe(false)
  })
})

describe('confirm password', () => {
  it('needs a password and nothing else', () => {
    expect(confirmPasswordInput.safeParse({ password: '' }).success).toBe(false)
    expect(confirmPasswordInput.safeParse({ password: 'x', userId: 'u' }).success).toBe(false)
  })
})

describe('organization profile edit', () => {
  it('can never change "Require two-step for everyone"', () => {
    const result = updateOrganizationInput.safeParse({ twoStepRequiredForEveryone: false })
    expect(result.success).toBe(false)
  })
})
