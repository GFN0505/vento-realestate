import { screen } from '@testing-library/react'
import type { FeatureKey } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { useFeature } from './use-available-features'

function Probe({ feature }: { feature: FeatureKey }) {
  return <p>{useFeature(feature) ? 'on' : 'off'}</p>
}

describe('useFeature', () => {
  it('is true only for features `me` lists as available', () => {
    const me = testMe('sales', { features: [{ key: 'sales', earlyAccess: false }] })
    renderWithMe(
      <>
        <Probe feature="sales" />
        <Probe feature="finance" />
      </>,
      me,
    )
    expect(screen.getAllByRole('paragraph').map((p) => p.textContent)).toEqual(['on', 'off'])
  })
})
