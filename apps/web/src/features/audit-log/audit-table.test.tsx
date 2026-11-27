import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type AuditRow, OTHER_DETAILS_CHANGED } from '@vento/shared'
import { describe, expect, it, vi } from 'vitest'
import { AuditTable } from './audit-table'
import { changeText, whereText } from './audit-words'

const row = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  id: '01900000-0000-7000-8000-0000000000e1',
  at: '2026-11-25T13:12:00.000Z',
  actor: {
    userId: '01900000-0000-7000-8000-0000000000e2',
    name: 'Olumide Bankole',
    kind: 'person',
  },
  module: 'settings',
  what: 'Changed role Finance manager',
  changes: [{ label: 'Approve in Finance', before: 'no', after: 'yes' }],
  device: 'Chrome on Mac',
  ipMasked: '102.89.34.x',
  ...overrides,
})

describe('AuditTable', () => {
  it('reads each row in plain words, Lagos time first', () => {
    render(<AuditTable rows={[row()]} onOpen={vi.fn()} />)
    const cells = within(screen.getAllByRole('row')[1] as HTMLElement).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('25 Nov 14:12')
    expect(screen.getByText('Approve in Finance: no → yes')).toBeVisible()
    expect(screen.getByText('Chrome on Mac · 102.89.34.x')).toBeInTheDocument()
  })

  it('shows unlabelled fields as Other details changed, never raw data', () => {
    const other = { label: OTHER_DETAILS_CHANGED, before: null, after: null }
    render(<AuditTable rows={[row({ changes: [other] })]} onOpen={vi.fn()} />)
    const cell = screen.getByText(OTHER_DETAILS_CHANGED)
    expect(cell).toHaveTextContent(/^Other details changed$/)
    expect(cell.textContent).not.toMatch(/[{}"→]/)
  })

  it('opens an entry from its What, by keyboard too', async () => {
    const onOpen = vi.fn()
    render(<AuditTable rows={[row()]} onOpen={onOpen} />)
    screen.getByRole('button', { name: 'Changed role Finance manager' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ what: 'Changed role Finance manager' }),
    )
  })
})

describe('audit words', () => {
  it('writes a missing side as a dash', () => {
    expect(changeText({ label: 'Role', before: null, after: 'Finance' })).toBe('Role: — → Finance')
  })

  it('leaves Where blank for system changes', () => {
    expect(whereText({ device: null, ipMasked: null })).toBe('')
  })
})
