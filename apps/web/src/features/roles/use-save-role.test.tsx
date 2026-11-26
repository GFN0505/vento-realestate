import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { testCustomRole } from '@/test/me'
import { useRoleUndo, useSaveRole } from './use-save-role'

vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return { ...actual, client: { roles: { update: vi.fn() } } }
})
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const before = testCustomRole()
const saved = testCustomRole({ version: 2, description: 'Site work only' })

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

/** Presses Undo on the last "saved" toast. */
function pressUndo() {
  const action = vi.mocked(toast.success).mock.calls.at(-1)?.[1]?.action
  if (!action || typeof action !== 'object' || !('onClick' in action)) throw new Error('no Undo')
  act(() => action.onClick(new MouseEvent('click') as never))
}

const changedBy = () =>
  new ORPCError('CONFLICT', {
    message:
      'Aisha Bello changed Site engineer a moment ago. Reload to see the latest, then make your change again.',
    data: { reason: 'role_changed', changedByName: 'Aisha Bello' },
  })

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(client.roles.update).mockReset()
  vi.mocked(toast.success).mockReset()
})

describe('saving a role', () => {
  it('offers Undo after a save', async () => {
    vi.mocked(client.roles.update).mockResolvedValue({ notice: 'saved', role: saved })
    const offer = vi.fn()
    const { result } = renderHook(() => useSaveRole(offer), { wrapper })
    await act(() => result.current.save(before, { id: before.id, version: 1, description: 'x' }))
    expect(offer).toHaveBeenCalledWith(before, saved)
  })

  it('says the role changed and offers Reload when someone saved first', async () => {
    vi.mocked(client.roles.update).mockRejectedValue(changedBy())
    const { result } = renderHook(() => useSaveRole(vi.fn()), { wrapper })
    await act(() => result.current.save(before, { id: before.id, version: 1, description: 'x' }))
    expect(result.current.stale).toBe(true)
  })

  it('keeps the ticks and sends nothing offline', async () => {
    vi.spyOn(connection, 'isOnline').mockReturnValue(false)
    const update = vi.mocked(client.roles.update)
    const { result } = renderHook(() => useSaveRole(vi.fn()), { wrapper })
    await act(() => result.current.save(before, { id: before.id, version: 1, description: 'x' }))
    expect(update).not.toHaveBeenCalled()
    expect((result.current.error as Error).message).toBe(OFFLINE_SAVE_ERROR)
  })
})

describe('Undo', () => {
  it('puts the old values back with the new version', async () => {
    const update = vi
      .spyOn(client.roles, 'update')
      .mockResolvedValue({ notice: 'saved', role: { ...before, version: 3 } })
    const { result } = renderHook(() => useRoleUndo({ current: false }), { wrapper })
    act(() => {
      result.current.offer(before, saved)
    })
    pressUndo()
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: before.id,
        version: 2,
        description: 'Based on Project manager',
      }),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Site engineer put back'))
  })

  it('says so, with Reload, when someone saved in between', async () => {
    vi.mocked(client.roles.update).mockRejectedValue(changedBy())
    const { result } = renderHook(() => useRoleUndo({ current: false }), { wrapper })
    act(() => {
      result.current.offer(before, saved)
    })
    pressUndo()
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('changed Site engineer'),
        expect.objectContaining({ action: expect.objectContaining({ label: 'Reload' }) }),
      ),
    )
  })

  it('asks first when the page has unsaved ticks', () => {
    const update = vi.mocked(client.roles.update)
    const { result } = renderHook(() => useRoleUndo({ current: true }), { wrapper })
    act(() => {
      result.current.offer(before, saved)
    })
    pressUndo()
    expect(result.current.asking).toEqual({ before, saved })
    expect(update).not.toHaveBeenCalled()
  })
})
