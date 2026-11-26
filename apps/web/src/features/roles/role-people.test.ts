import { describe, expect, it } from 'vitest'
import { moveFirstLine, peopleLine } from './role-people'

describe('who holds a role', () => {
  it('counts people and open invitations', () => {
    expect(peopleLine({ memberCount: 3, invitedCount: 0 })).toBe('3 people')
    expect(peopleLine({ memberCount: 1, invitedCount: 1 })).toBe('1 person · 1 invited')
    expect(peopleLine({ memberCount: 0, invitedCount: 0 })).toBe('Nobody')
    expect(peopleLine({ memberCount: 0, invitedCount: 2 })).toBe('Nobody · 2 invited')
  })

  it('says who to move before a delete', () => {
    expect(moveFirstLine({ memberCount: 1, invitedCount: 0 })).toBe(
      'Move 1 person to another role first',
    )
    expect(moveFirstLine({ memberCount: 2, invitedCount: 1 })).toBe(
      'Move 3 people to another role first',
    )
  })
})
