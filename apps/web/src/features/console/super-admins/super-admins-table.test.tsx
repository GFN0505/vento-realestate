import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SuperAdminRow } from '@vento/shared/console'
import { describe, expect, it, vi } from 'vitest'
import { SuperAdminsTable } from './super-admins-table'

const row = (patch: Partial<SuperAdminRow>): SuperAdminRow => ({
  userId: '019a0000-0000-7000-8000-000000000001',
  name: 'Ada Okafor',
  email: 'ada@ventoerp.com',
  since: '2026-11-01T09:00:00Z',
  grantedByName: 'Tunde Bello',
  lastConsoleAt: null,
  isYou: false,
  canResetTwoStep: true,
  ...patch,
})

describe('the super-admins table', () => {
  it('offers Reset two-step only where the server allows it, and nothing on your own row', async () => {
    render(
      <SuperAdminsTable
        rows={[
          row({}),
          row({
            userId: '019a0000-0000-7000-8000-000000000002',
            name: 'Chika Obi',
            canResetTwoStep: false,
          }),
          row({ userId: '019a0000-0000-7000-8000-000000000003', name: 'Tunde Bello', isYou: true }),
        ]}
        onRemove={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Actions for Tunde Bello' }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Chika Obi' }))
    expect(screen.queryByRole('menuitem', { name: 'Reset two-step' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()
  })
})
