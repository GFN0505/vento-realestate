import { describe, expect, it } from 'vitest'
import { joinNames } from './text'

describe('joinNames', () => {
  it('returns an empty string for no names', () => {
    expect(joinNames([])).toBe('')
  })

  it('returns a single name as it is', () => {
    expect(joinNames(['owners'])).toBe('owners')
  })

  it('joins two names with "and"', () => {
    expect(joinNames(['owners', 'admins'])).toBe('owners and admins')
  })

  it('joins three or more with commas and a final "and"', () => {
    expect(joinNames(['owners', 'admins', 'HR staff', 'finance staff'])).toBe(
      'owners, admins, HR staff and finance staff',
    )
  })
})
