import { describe, expect, it } from 'vitest'
import { twoStepRefusal, twoStepRequiredLine } from './two-step-copy'

const byRole = { reason: 'role', organizationName: 'Vento Homes Ltd', roleName: 'Finance' } as const
const byOrg = {
  reason: 'organization',
  organizationName: 'Vento Homes Ltd',
  roleName: null,
} as const

describe('two-step copy', () => {
  it('names the role and organization in the refusal', () => {
    expect(twoStepRefusal(byRole)).toBe(
      "Two-step is required for your role (Finance) in Vento Homes Ltd, so it can't be turned off.",
    )
    expect(twoStepRefusal(byOrg)).toBe(
      "Vento Homes Ltd requires two-step for everyone, so it can't be turned off.",
    )
  })

  it('gives My security a short line', () => {
    expect(twoStepRequiredLine(byRole)).toBe('Required for your role (Finance)')
    expect(twoStepRequiredLine(byOrg)).toBe('Required by Vento Homes Ltd')
  })
})
