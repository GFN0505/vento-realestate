import { describe, expect, it } from 'vitest'
import { daysUntilInLagos, financialYearSpan, formatDate, formatDayMonth } from './format'
import { formatDateTime, formatNaira } from './format-more'

describe('formatDate', () => {
  it('writes a calendar date the Nigerian way', () => {
    expect(formatDate('2027-01-02')).toBe('2 Jan 2027')
  })

  it('writes September as Sep, never Sept', () => {
    expect(formatDate('2026-09-03')).toBe('3 Sep 2026')
    expect(formatDayMonth('2026-09-03')).toBe('3 Sep')
  })

  it('reads an instant on its Lagos day', () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in Lagos.
    expect(formatDate('2026-09-30T23:30:00Z')).toBe('1 Oct 2026')
  })
})

describe('formatDateTime', () => {
  const now = new Date('2026-11-28T09:00:00Z')

  it('leaves the year out this year', () => {
    expect(formatDateTime('2026-09-25T13:12:00Z', now)).toBe('25 Sep 14:12')
  })

  it('adds the year for another year', () => {
    expect(formatDateTime('2025-11-25T13:12:00Z', now)).toBe('25 Nov 2025 14:12')
  })
})

describe('formatNaira', () => {
  it('always shows the kobo', () => {
    expect(formatNaira('840000000')).toBe('₦840,000,000.00')
    expect(formatNaira('1250.5')).toBe('₦1,250.50')
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

describe('financialYearSpan', () => {
  it('names the first and last month of the year', () => {
    expect(financialYearSpan(1)).toBe('January – December')
    expect(financialYearSpan(4)).toBe('April – March')
    expect(financialYearSpan(12)).toBe('December – November')
  })
})
