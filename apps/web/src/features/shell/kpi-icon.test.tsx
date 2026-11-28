import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiIcon } from './kpi-icon'

describe('Home number icon', () => {
  it('draws the named icon once its set has loaded', async () => {
    const { container } = render(<KpiIcon name="landmark" />)
    await waitFor(() => expect(container.querySelector('svg.lucide-landmark')).not.toBeNull())
    expect(container.querySelector('svg')).toHaveClass('size-4')
  })
})
