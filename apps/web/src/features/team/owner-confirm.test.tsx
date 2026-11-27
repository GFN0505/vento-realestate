import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PreviewApprovalOutput, TeamMemberRow } from '@vento/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { client } from '@/lib/orpc'
import { NO_ONE_ELSE, OwnerConfirm, ownerPreviewQuery } from './owner-confirm'

vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return { ...actual, client: { members: { updateAccess: vi.fn() } } }
})

const MEMBER = '01900000-0000-7000-8000-0000000000f1'
const OWNER_ROLE = {
  id: '01900000-0000-7000-8000-0000000000f2',
  key: 'owner' as const,
  name: 'Owner',
}

const grace: TeamMemberRow = {
  kind: 'member',
  id: MEMBER,
  userId: '01900000-0000-7000-8000-0000000000f3',
  name: 'Grace Umeh',
  email: 'grace@lekkipartners.ng',
  isYou: false,
  role: { id: '01900000-0000-7000-8000-0000000000f4', key: 'admin', name: 'Admin' },
  access: { kind: 'all' },
  twoStep: 'on',
  passkeyCount: 0,
  joinedAt: '2026-11-01T10:00:00.000Z',
  lastActiveAt: null,
  can: { changeAccess: true, resetTwoStep: false, remove: true },
  readOnly: null,
  pendingApproval: null,
}

function renderConfirm(preview: PreviewApprovalOutput | 'error') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = ownerPreviewQuery(MEMBER).queryKey
  if (preview === 'error') {
    queryClient.setQueryDefaults(key, { queryFn: () => Promise.reject(new TypeError('offline')) })
  } else {
    queryClient.setQueryData(key, preview)
  }
  render(
    <QueryClientProvider client={queryClient}>
      <OwnerConfirm
        confirm={{ kind: 'owner', row: grace, role: OWNER_ROLE }}
        open
        organization="Lekki Partners Ltd"
        onClose={vi.fn()}
        openRequest={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

const ruled = {
  needed: true,
  chain: 'Needs approval by Owner.',
  policy: 'Make someone an owner needs approval by Owner.',
  blocked: null,
  pendingRequestId: null,
} as const

afterEach(() => vi.mocked(client.members.updateAccess).mockReset())

describe('Make owner', () => {
  it('opens the send sheet straight away when a rule applies, with no confirm first', () => {
    renderConfirm({ ...ruled, proceedsWithoutApprover: false })
    expect(screen.getByRole('dialog', { name: 'Send for approval' })).toBeVisible()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('confirms plainly when nobody else could approve, and makes them an owner now', async () => {
    vi.mocked(client.members.updateAccess).mockResolvedValue(
      {} as Awaited<ReturnType<typeof client.members.updateAccess>>,
    )
    renderConfirm({ ...ruled, proceedsWithoutApprover: true })
    expect(screen.getByRole('alertdialog')).toHaveTextContent(NO_ONE_ELSE)
    expect(screen.queryByRole('dialog', { name: 'Send for approval' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Make owner' }))
    expect(client.members.updateAccess).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: MEMBER, roleId: OWNER_ROLE.id, reason: undefined }),
    )
  })

  it("says so and offers Try again when it can't check, never a plain confirm", async () => {
    renderConfirm('error')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "couldn't check whether this needs approval",
    )
    expect(screen.queryByRole('button', { name: 'Make owner' })).toBeNull()
  })
})
