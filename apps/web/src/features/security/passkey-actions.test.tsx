import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { AUTH_ERROR_MESSAGES } from '@vento/shared'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { securityQuery } from '@/features/settings/security-queries'
import { NETWORK_ERROR } from '@/lib/error-copy'
import { ADD_FAILED, addPasskeyError, useAddPasskey } from './passkey-actions'
import { securityUi } from './security-dialogs'
import { testSecurity } from './test-data'

const addPasskey = vi.hoisted(() => vi.fn())
vi.mock('@/lib/passkey-client', () => ({
  passkeyAuth: { passkey: { addPasskey } },
  isPasskeyCancel: (code?: string) => code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
}))
vi.mock('@/lib/connection', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/connection')>()
  return {
    ...real,
    connection: { ...real.connection, isOnline: () => true, reportNetworkFailure: () => {} },
  }
})
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const isCancel = (code?: string) => code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'

afterEach(() => {
  vi.clearAllMocks()
  act(() => securityUi.reset())
})

describe('adding a passkey: what each failure says', () => {
  it('says nothing when the person closed the prompt', () => {
    expect(
      addPasskeyError({ code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', status: 400 }, isCancel),
    ).toBeNull()
  })

  it('names a device that already has one, and the limit', () => {
    expect(
      addPasskeyError({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', status: 400 }, isCancel),
    ).toBe('This device already has a passkey for your account.')
    expect(addPasskeyError({ code: 'PASSKEY_LIMIT', status: 409 }, isCancel)).toBe(
      AUTH_ERROR_MESSAGES.PASSKEY_LIMIT,
    )
  })

  it('says the connection failed, else what to try', () => {
    expect(addPasskeyError({ status: 0 }, isCancel)).toBe(NETWORK_ERROR)
    expect(addPasskeyError({ code: 'SOMETHING', status: 500 }, isCancel)).toBe(ADD_FAILED)
  })
})

describe('adding a passkey when the confirmation has lapsed', () => {
  it('asks for the password once and tries again', async () => {
    const queryClient = new QueryClient()
    const until = new Date(Date.now() + 4 * 60_000).toISOString()
    queryClient.setQueryData(
      securityQuery().queryKey,
      testSecurity({ reauthenticatedUntil: until }),
    )
    addPasskey
      .mockResolvedValueOnce({ data: null, error: { code: 'REAUTH_REQUIRED', status: 403 } })
      .mockResolvedValueOnce({ data: { id: 'p1', name: 'iCloud Keychain · Mac' }, error: null })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useAddPasskey(), { wrapper })

    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.add()
    })
    await vi.waitFor(() => expect(securityUi.confirmOpen()).toBe(true))
    act(() => securityUi.settleConfirm(true))
    await act(() => done)

    expect(addPasskey).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith(
      'Passkey added · iCloud Keychain · Mac',
      expect.anything(),
    )
  })
})
