import { ORPCError } from '@orpc/client'
import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { shellUi } from '@/features/shell/shell-ui'
import { client } from '@/lib/orpc'
import { testMe, testRoles } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { InviteSheet } from './invite-sheet'
import { inviteDraft } from './use-invite-draft'

vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return {
    ...actual,
    client: { invitations: { create: vi.fn(), resend: vi.fn() } },
  }
})

const roles = testRoles()

function renderSheet() {
  const me = testMe('owner', { plan: null })
  const view = renderWithMe(<InviteSheet />, me, roles, (queryClient) =>
    queryClient.setQueryData(entitiesQuery().queryKey, {
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
    }),
  )
  act(() => shellUi.open('invite'))
  return view
}

function paste(text: string) {
  const box = screen.getByLabelText('Emails')
  fireEvent.paste(box, { clipboardData: { getData: () => text } })
}

beforeEach(() => inviteDraft.reset(null))
afterEach(() => {
  act(() => shellUi.close('invite'))
  vi.mocked(client.invitations.create).mockReset()
})

describe('InviteSheet', () => {
  it('turns a pasted column into rows and names the count on Send', () => {
    renderSheet()
    paste('aisha@ventohomes.ng\ngrace@ventohomes.ng\nkunle@ventohomes.ng')

    const rows = within(screen.getByRole('list', { name: 'People to invite' })).getAllByRole(
      'listitem',
    )
    expect(rows).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Send 3 invitations' })).toBeInTheDocument()
  })

  it("asks for a role before sending, and marks the viewer's own email", async () => {
    renderSheet()
    paste('bisi@lekkipartners.ng aisha@ventohomes.ng')

    expect(screen.getByText("That's you")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 invitations' }))
    expect(client.invitations.create).not.toHaveBeenCalled()
  })

  it('marks every clashing row from one refusal, and keeps them all', async () => {
    vi.mocked(client.invitations.create).mockRejectedValue(
      new ORPCError('CONFLICT', {
        message: '2 of these people are already in or invited. Nothing was sent.',
        data: {
          reason: 'already_member',
          alreadyMembers: ['grace@ventohomes.ng'],
          alreadyInvited: [{ email: 'kunle@ventohomes.ng', id: 'inv-1' }],
        },
      }),
    )
    renderSheet()
    paste('aisha@ventohomes.ng, grace@ventohomes.ng, kunle@ventohomes.ng')
    act(() => inviteDraft.setRole('role-sales'))

    await userEvent.click(screen.getByRole('button', { name: 'Send 3 invitations' }))

    expect(await screen.findByText('Already a member')).toBeInTheDocument()
    expect(screen.getByText('Already invited')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend instead' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('cannot be sent twice while sending', async () => {
    vi.mocked(client.invitations.create).mockReturnValue(new Promise(() => undefined))
    renderSheet()
    paste('aisha@ventohomes.ng')
    act(() => inviteDraft.setRole('role-sales'))

    const send = screen.getByRole('button', { name: 'Send invitation' })
    await userEvent.click(send)
    await userEvent.click(send)

    expect(send).toBeDisabled()
    expect(client.invitations.create).toHaveBeenCalledOnce()
  })
})
