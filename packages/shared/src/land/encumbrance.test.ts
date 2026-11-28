import { describe, expect, it } from 'vitest'
import {
  addYears,
  alwaysBlocks,
  ENCUMBRANCE_TYPES,
  encumbranceSuffix,
  mostSerious,
  nextDateLabel,
} from './encumbrance'

const e = (
  type: (typeof ENCUMBRANCE_TYPES)[number],
  blocksSales: boolean,
  servedOn = '2026-11-04',
) => ({
  type,
  blocksSales,
  servedOn,
})

describe('encumbrances', () => {
  it('orders the types by severity, court order first', () => {
    expect(ENCUMBRANCE_TYPES).toEqual([
      'court_order',
      'caveat',
      'family_dispute',
      'lien',
      'mortgage',
    ])
  })

  it('always blocks sales except for a mortgage, which is a choice', () => {
    expect(ENCUMBRANCE_TYPES.filter(alwaysBlocks)).toEqual([
      'court_order',
      'caveat',
      'family_dispute',
      'lien',
    ])
    expect(alwaysBlocks('mortgage')).toBe(false)
  })

  it('names blocking ones first, then by severity, then the oldest', () => {
    expect(mostSerious([e('mortgage', true), e('lien', true)])?.type).toBe('lien')
    expect(mostSerious([e('court_order', false), e('mortgage', true)])?.type).toBe('mortgage')
    expect(
      mostSerious([e('caveat', true, '2026-10-01'), e('caveat', true, '2026-09-01')])?.servedOn,
    ).toBe('2026-09-01')
    expect(mostSerious([])).toBeNull()
  })

  it('calls a court order’s next date a hearing', () => {
    expect(nextDateLabel('court_order')).toBe('Hearing')
    expect(nextDateLabel('caveat')).toBe('Next date')
  })

  it('names the evidence by reference, or by date without one', () => {
    expect(encumbranceSuffix('caveat', 'CV/LAG/2026/114', '4 Nov 2026')).toBe(
      'Caveat · CV/LAG/2026/114',
    )
    expect(encumbranceSuffix('court_order', null, '4 Nov 2026')).toBe('Court order · 4 Nov 2026')
  })
})

describe('addYears', () => {
  it('moves a date by whole years, 29 Feb to 28 Feb', () => {
    expect(addYears('2026-11-04', 10)).toBe('2036-11-04')
    expect(addYears('2026-11-04', -1)).toBe('2025-11-04')
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28')
  })
})
