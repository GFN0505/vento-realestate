import { describe, expect, it } from 'vitest'
import { trialEndingSoon, trialLineText } from './trial-copy'

const trial = (endsOn: string, losing = ['Board pack']) => ({
  planName: 'Enterprise',
  endsOn,
  losing,
})
// 26 Dec 2026, 10:00 in Lagos.
const now = new Date('2026-12-26T09:00:00Z')

describe('when the trial line shows', () => {
  it('hides it 8 days before the end', () => {
    expect(trialEndingSoon(trial('2027-01-03'), now)).toBe(false)
  })

  it('shows it 7 days before the end and on the last day', () => {
    expect(trialEndingSoon(trial('2027-01-02'), now)).toBe(true)
    expect(trialEndingSoon(trial('2026-12-26'), now)).toBe(true)
  })

  it('hides it once the trial has ended, or with no trial', () => {
    expect(trialEndingSoon(trial('2026-12-25'), now)).toBe(false)
    expect(trialEndingSoon(null, now)).toBe(false)
  })
})

describe('trial line copy', () => {
  it('matches the spec for one feature', () => {
    expect(trialLineText(trial('2027-01-02'))).toBe(
      'Your Enterprise trial ends on 2 Jan 2027. After that, the board pack is no longer available. Your data stays.',
    )
  })

  it('agrees with plural labels and lists several', () => {
    expect(trialLineText(trial('2027-01-02', ['Commissions']))).toContain(
      'the commissions are no longer available',
    )
    expect(trialLineText(trial('2027-01-02', ['Board pack', 'Tax']))).toContain(
      'After that, board pack and tax are no longer available.',
    )
  })

  it('names three and counts the rest', () => {
    const losing = ['Board pack', 'Tax', 'Contracts', 'Month-end close', 'Facilities']
    expect(trialLineText(trial('2027-01-02', losing))).toContain(
      'board pack, tax, contracts and 2 more are no longer available',
    )
  })

  it('keeps capitals that belong to the name', () => {
    expect(trialLineText(trial('2027-01-02', ['HR & payroll']))).toContain('the HR & payroll is')
  })

  it('says only the end date when nothing is lost', () => {
    expect(trialLineText(trial('2027-01-02', []))).toBe('Your Enterprise trial ends on 2 Jan 2027.')
  })
})
