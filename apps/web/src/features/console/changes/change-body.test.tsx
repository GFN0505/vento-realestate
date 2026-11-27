import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChangeFooter } from './change-body'
import type { ChangeController } from './use-change'

function controller(patch: Partial<ChangeController>): ChangeController {
  return {
    step: 'review',
    lines: [],
    reason: '',
    setReason: vi.fn(),
    blurReason: vi.fn(),
    reasonError: null,
    canApply: false,
    pending: null,
    failure: null,
    apply: vi.fn(async () => {}),
    back: vi.fn(),
    dirty: false,
    ...patch,
  }
}

describe('the change footer', () => {
  it('says why the button waits for a reason', () => {
    render(
      <ChangeFooter
        change={controller({})}
        formId="f"
        hasFields
        confirmLabel="Move to Growth"
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Move to Growth' })).toBeDisabled()
    expect(screen.getByText('Add a reason to continue.')).toBeInTheDocument()
  })

  it('offers Close when a change with no fields was refused', () => {
    render(
      <ChangeFooter
        change={controller({ step: 'fields' })}
        formId="f"
        hasFields={false}
        confirmLabel="End trial"
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End trial' })).not.toBeInTheDocument()
  })
})
