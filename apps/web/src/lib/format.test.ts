import { describe, expect, it } from 'vitest'
import { daysUntilInLagos, formatDate } from './format'

describe('formatDate', () => {
  it('writes a calendar date the Nigerian way', () => {
    expect(formatDate('2027-01-02')).toBe('2 Jan 2027')
  })
})

describe('daysUntilInLagos', () => {
  it('counts calendar days in Lagos, whatever the clock zone', () => {
    // 23:30 UTC on 25 Dec is already 26 Dec in Lagos (UTC+1).
    const now = new Date('2026-12-25T23:30:00Z')
    expect(daysUntilInLagos('2026-12-26', now)).toBe(0)
    expect(daysUntilInLagos('2027-01-02', now)).toBe(7)
    expect(daysUntilInLagos('2026-12-25', now)).toBe(-1)
  })
})
