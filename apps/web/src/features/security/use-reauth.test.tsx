import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { securityQuery } from '@/features/settings/security-queries'
import { securityUi } from './security-dialogs'
import { testSecurity } from './test-data'
import { confirmedRecently, useReauth } from './use-reauth'

function setup(reauthenticatedUntil: string | null) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(securityQuery().queryKey, testSecurity({ reauthenticatedUntil }))
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useReauth(), { wrapper }).result
}

afterEach(() => act(() => securityUi.reset()))

describe('Confirm it’s you', () => {
  it('is skipped inside the 5-minute window', async () => {
    const reauth = setup(new Date(Date.now() + 4 * 60_000).toISOString())

    await expect(reauth.current.ensureConfirmed()).resolves.toBe(true)
  })

  it('asks when the window is closed, and carries on once confirmed', async () => {
    const reauth = setup(null)

    const asked = reauth.current.ensureConfirmed()
    act(() => securityUi.settleConfirm(true))

    await expect(asked).resolves.toBe(true)
  })

  it('reports a cancelled question', async () => {
    const reauth = setup(null)

    const asked = reauth.current.ensureConfirmed()
    act(() => securityUi.settleConfirm(false))

    await expect(asked).resolves.toBe(false)
  })

  it('treats a window about to close as closed', () => {
    const soon = new Date(Date.now() + 5_000).toISOString()
    expect(confirmedRecently(testSecurity({ reauthenticatedUntil: soon }))).toBe(false)
  })
})
