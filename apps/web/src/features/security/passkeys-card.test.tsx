import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PasskeysCard } from './passkeys-card'
import { testSecurity } from './test-data'

const support = vi.hoisted(() => ({ supported: true }))
vi.mock('@/lib/passkey-support', () => ({ browserSupportsPasskeys: () => support.supported }))

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const passkey = (n: number) => ({
  id: `019300aa-0000-7000-8000-00000000000${n}`,
  name: n === 0 ? 'iCloud Keychain · iPhone' : `Passkey ${n}`,
  createdAt: '2026-11-06T09:00:00Z',
  lastUsedAt: null,
})

afterEach(() => {
  support.supported = true
})

describe('the Passkeys card', () => {
  it('explains what a passkey is when there are none, with Add a passkey', () => {
    wrap(<PasskeysCard data={testSecurity()} adding={false} onAdd={() => {}} />)

    expect(screen.getByText(/No passkeys yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeInTheDocument()
    expect(screen.getByText("Only add a passkey on a device that's yours.")).toBeInTheDocument()
  })

  it('lists each passkey with when it was added and a menu', () => {
    const data = testSecurity({ passkeys: { available: true, items: [passkey(0)], limit: 10 } })
    wrap(<PasskeysCard data={data} adding={false} onAdd={() => {}} />)

    expect(screen.getByText('iCloud Keychain · iPhone')).toBeInTheDocument()
    expect(screen.getByText('Added 6 Nov 2026 · Never used')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Actions for iCloud Keychain · iPhone' }),
    ).toBeInTheDocument()
  })

  it('replaces Add a passkey with the limit at 10', () => {
    const items = Array.from({ length: 10 }, (_, i) => passkey(i))
    wrap(
      <PasskeysCard
        data={testSecurity({ passkeys: { available: true, items, limit: 10 } })}
        adding={false}
        onAdd={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
    expect(
      screen.getByText('You can have up to 10 passkeys. Remove one you no longer use.'),
    ).toBeInTheDocument()
  })

  it("says when this browser can't create passkeys", () => {
    support.supported = false
    wrap(<PasskeysCard data={testSecurity()} adding={false} onAdd={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
    expect(screen.getByText(/This browser can't create passkeys/)).toBeInTheDocument()
  })

  it('reminds people who must use two-step to keep their authenticator app', () => {
    const requiredBy = {
      organizationName: 'Vento Homes Ltd',
      reason: 'role',
      roleName: 'Owner',
    } as const
    const data = testSecurity({
      twoStep: { enabled: true, requiredBy, backupCodesLeft: 10 },
      passkeys: { available: true, items: [passkey(0)], limit: 10 },
    })
    wrap(<PasskeysCard data={data} adding={false} onAdd={() => {}} />)

    expect(screen.getByText(/A passkey counts as two-step when you sign in/)).toBeInTheDocument()
  })
})
