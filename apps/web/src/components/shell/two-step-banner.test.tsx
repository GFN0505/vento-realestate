import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { TwoStepBanner } from './two-step-banner'

const requiredBy = {
  organizationName: 'Lekki Partners Ltd',
  reason: 'organization',
  roleName: null,
} as const
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

describe('the two-step banner', () => {
  it('says the organization requires two-step while days are left', () => {
    renderWithMe(
      <TwoStepBanner />,
      testMe('sales', { twoStepRequiredBy: requiredBy, twoStepSetupBy: days(5) }),
    )

    expect(
      screen.getByText('Lekki Partners Ltd now requires two-step sign-in.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up two-step' })).toBeInTheDocument()
  })

  it('says today on the last day', () => {
    renderWithMe(
      <TwoStepBanner />,
      testMe('sales', { twoStepRequiredBy: requiredBy, twoStepSetupBy: days(0) }),
    )

    expect(
      screen.getByText('Set up two-step today to keep using Lekki Partners Ltd.'),
    ).toBeInTheDocument()
  })

  it('stays away outside the grace period', () => {
    renderWithMe(<TwoStepBanner />, testMe('sales'))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
