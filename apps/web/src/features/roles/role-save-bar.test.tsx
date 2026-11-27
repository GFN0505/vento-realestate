import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoleSaveBar, saveBarLine } from './role-save-bar'

describe('save bar', () => {
  it('says how many changes and who they reach', () => {
    expect(saveBarLine(3, 4)).toBe('3 changes · applies to 4 people on their next click')
    expect(saveBarLine(1, 1)).toBe('1 change · applies to 1 person on their next click')
  })

  it('says when nobody has the role yet', () => {
    expect(saveBarLine(3, 0)).toBe('3 changes · applies to nobody yet')
  })

  const bar = (sendForApproval: boolean) =>
    render(
      <RoleSaveBar
        sendForApproval={sendForApproval}
        count={2}
        people={3}
        empty={false}
        pending={false}
        error={null}
        stale={false}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
      />,
    )

  it('reads Send for approval when a rule applies to the change', () => {
    bar(true)
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('reads Save changes when no rule applies', () => {
    bar(false)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})
