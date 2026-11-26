import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ListTeamOutput, TeamMemberRow } from '@vento/shared'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetConnectionForTests } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { useChangeRole } from './use-change-role'

vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return { ...actual, client: { members: { updateAccess: vi.fn() } } }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const sales = { id: 'role-sales', key: 'sales' as const, name: 'Sales' }
const finance = { id: 'role-finance', key: 'finance' as const, name: 'Finance' }
const aisha: TeamMemberRow = {
  kind: 'member',
  id: 'm-aisha',
  userId: 'u-aisha',
  name: 'Aisha Bello',
  email: 'aisha@ventohomes.ng',
  isYou: false,
  role: sales,
  access: { kind: 'all' },
  twoStep: 'on',
  joinedAt: '2026-11-20T09:00:00Z',
  lastActiveAt: null,
  can: { changeAccess: true, resetTwoStep: true, remove: true },
  readOnly: null,
}
const key = ['team', 'page-1']
const page: ListTeamOutput = {
  items: [aisha],
  page: 1,
  pageSize: 50,
  total: 1,
  counts: { members: 1, invited: 0, removed: 0 },
}

function setup() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(key, page)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useChangeRole(key), { wrapper })
  const roleOf = () => {
    const row = queryClient.getQueryData<ListTeamOutput>(key)?.items[0]
    return row?.kind === 'member' ? row.role.name : null
  }
  return { change: result.current, roleOf }
}

afterEach(() => {
  vi.mocked(client.members.updateAccess).mockReset()
  vi.mocked(toast.success).mockReset()
  resetConnectionForTests(true)
})

describe('useChangeRole', () => {
  it('changes the row at once, then offers Undo', async () => {
    vi.mocked(client.members.updateAccess).mockResolvedValue({
      notice: 'ok',
      row: { ...aisha, role: finance },
    })
    const { change, roleOf } = setup()

    change(aisha, finance)

    expect(roleOf()).toBe('Finance')
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Aisha Bello is now Finance',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
      ),
    )
    expect(client.members.updateAccess).toHaveBeenCalledWith({
      memberId: 'm-aisha',
      roleId: 'role-finance',
      entityIds: null,
    })
  })

  it('puts the old role back when the server refuses', async () => {
    vi.mocked(client.members.updateAccess).mockRejectedValue(new Error('refused'))
    const onError = vi.fn()
    const { change, roleOf } = setup()

    change(aisha, finance, { onError })

    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(roleOf()).toBe('Sales')
  })

  it('Undo saves the previous role as a second change', async () => {
    vi.mocked(client.members.updateAccess)
      .mockResolvedValueOnce({ notice: 'ok', row: { ...aisha, role: finance } })
      .mockResolvedValueOnce({ notice: 'ok', row: aisha })
    const { change, roleOf } = setup()

    change(aisha, finance)
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const options = vi.mocked(toast.success).mock.calls[0]?.[1]
    const undo = options?.action as { onClick?: (event: unknown) => void } | undefined
    if (!undo?.onClick) throw new Error('expected an Undo action')
    undo.onClick({})

    await waitFor(() => expect(roleOf()).toBe('Sales'))
    expect(client.members.updateAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ roleId: 'role-sales' }),
    )
  })

  it('changes nothing while offline', () => {
    resetConnectionForTests(false)
    const { change, roleOf } = setup()

    change(aisha, finance)

    expect(roleOf()).toBe('Sales')
    expect(client.members.updateAccess).not.toHaveBeenCalled()
  })
})
