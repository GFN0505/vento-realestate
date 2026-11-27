import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreviewLines } from '../changes/preview-lines'
import { KillSwitch, StageControl } from './stage-control'

describe('the stage control', () => {
  it('marks the current stage and asks before moving to another', async () => {
    const onMove = vi.fn()
    render(<StageControl stage="internal" onMove={onMove} />)
    expect(screen.getByRole('button', { name: /Internal/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Internal/ }))
    expect(onMove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Pilot' }))
    expect(onMove).toHaveBeenCalledWith('pilot')
  })

  it('keeps the kill switch visible, and quiet once the feature is off', async () => {
    const onTurnOff = vi.fn()
    const { rerender } = render(<KillSwitch label="Sales" off={false} onTurnOff={onTurnOff} />)
    await userEvent.click(screen.getByRole('button', { name: 'Turn off for everyone' }))
    expect(onTurnOff).toHaveBeenCalled()
    rerender(<KillSwitch label="Sales" off onTurnOff={onTurnOff} />)
    expect(screen.getByRole('button', { name: 'Turn off for everyone' })).toBeDisabled()
  })
})

describe('preview lines', () => {
  it('say warnings and dangers in words as well as colour', () => {
    render(
      <PreviewLines
        lines={[
          { text: 'Sales will be available to 3 organizations.', tone: 'info' },
          { text: 'Sales is in no plan.', tone: 'warning' },
          { text: 'Lekki Partners Ltd has 214 records in Sales.', tone: 'danger' },
        ]}
      />,
    )
    expect(screen.getByText('Warning:', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Important:', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
