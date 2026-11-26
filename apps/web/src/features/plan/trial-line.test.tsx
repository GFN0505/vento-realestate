import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testMe, testPlan } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { TrialLine } from './trial-line'

// 26 Dec 2026 in Lagos; the trial's last day is 2 Jan 2027 (7 days away).
const now = new Date('2026-12-26T09:00:00Z')
const trial = { planName: 'Enterprise', endsOn: '2027-01-02', losing: ['Board pack'] }

describe('TrialLine', () => {
  it('shows an owner when the trial ends, what goes, and Talk to Vento', () => {
    renderWithMe(<TrialLine now={now} />, testMe('owner', { plan: testPlan({ trial }) }))

    expect(
      screen.getByText(
        'Your Enterprise trial ends on 2 Jan 2027. After that, the board pack is no longer available. Your data stays.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Talk to Vento' })).toBeInTheDocument()
  })

  it('stays hidden 8 days before the end', () => {
    const early = { ...trial, endsOn: '2027-01-03' }
    renderWithMe(<TrialLine now={now} />, testMe('owner', { plan: testPlan({ trial: early }) }))

    expect(screen.queryByRole('region', { name: 'Your trial' })).not.toBeInTheDocument()
  })

  it('never shows to anyone but the owner', () => {
    renderWithMe(<TrialLine now={now} />, testMe('admin'))

    expect(screen.queryByRole('region', { name: 'Your trial' })).not.toBeInTheDocument()
  })
})
