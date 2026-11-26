import { describe, expect, it } from 'vitest'
import { teamListInput, validateTeamSearch } from './team-search'

describe('validateTeamSearch', () => {
  it('keeps a role id and ignores anything else', () => {
    const id = '0193a8c4-7d1e-7b2a-9f00-1234567890ab'
    expect(validateTeamSearch({ role: id }).role).toBe(id)
    expect(validateTeamSearch({ role: 'sales' }).role).toBeUndefined()
  })

  it('ignores an unknown chip and a bad page', () => {
    expect(validateTeamSearch({ show: 'everyone', page: '0' })).toMatchObject({
      show: undefined,
      page: undefined,
    })
  })
})

describe('teamListInput', () => {
  it('follows the top bar entity, and ignores one that is not an id', () => {
    const id = '0193a8c4-7d1e-7b2a-9f00-1234567890ab'
    expect(teamListInput({ entity: id }).entityId).toBe(id)
    expect(teamListInput({ entity: 'parkview' }).entityId).toBeUndefined()
  })
})
