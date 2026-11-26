import { ORPCError } from '@orpc/client'
import { act, configure, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { shellUi } from '@/features/shell/shell-ui'
import { client } from '@/lib/orpc'
import { testMe, testPlan, testRoles } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { InviteSheet } from './invite-sheet'
import { inviteDraft } from './use-invite-draft'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => undefined,
}))
vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return {
    ...actual,
    client: { invitations: { create: vi.fn(), resend: vi.fn() } },
  }
})

const roles = testRoles()

function renderSheet(me = testMe('owner', { plan: null })) {
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

beforeEach(() => {
  inviteDraft.reset(null)
  localStorage.clear()
})
afterEach(() => {
  configure({ reactStrictMode: false })
  act(() => shellUi.close('invite'))
  vi.mocked(client.invitations.create).mockReset()
})

const sent = () => vi.mocked(client.invitations.create).mock.calls[0]?.[0]

describe('InviteSheet', () => {
  it('Invite again keeps the email and last role over every default, even in StrictMode', () => {
    const me = testMe('owner', { plan: null })
    // As in the app: the shell mounts the sheet already open, in StrictMode.
    act(() => shellUi.openInvite({ emails: ['grace@ventohomes.ng'], roleId: 'role-hr' }))
    // As in the app (main.tsx): StrictMode runs mount effects twice in development.
    configure({ reactStrictMode: true })
    renderWithMe(<InviteSheet />, me, roles, (queryClient) =>
      queryClient.setQueryData(entitiesQuery().queryKey, {
        items: [],
        page: 1,
        pageSize: 100,
        total: 0,
      }),
    )

    const list = screen.getByRole('list', { name: 'People to invite' })
    expect(within(list).getByText('grace@ventohomes.ng')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('HR')
  })

  it('turns a pasted column into rows, with a role already chosen', () => {
    renderSheet()
    paste('aisha@ventohomes.ng\ngrace@ventohomes.ng\nkunle@ventohomes.ng')

    const list = screen.getByRole('list', { name: 'People to invite' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('Sales')
    expect(screen.getByRole('button', { name: 'Send 3 invitations' })).toBeEnabled()
  })

  it('counts only rows that will go, and skips marked rows when sending', async () => {
    vi.mocked(client.invitations.create).mockResolvedValue({ notice: '', sent: 1, invitations: [] })
    renderSheet()
    paste('bisi@lekkipartners.ng aisha@ventohomes.ng kemi@')

    expect(screen.getByText("That's you")).toBeInTheDocument()
    expect(screen.getByText("2 marked emails won't be sent.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect(sent()?.items).toEqual([{ email: 'aisha@ventohomes.ng', roleId: 'role-sales' }])
    // The marked rows stay behind to fix or remove.
    expect(screen.getByText('kemi@')).toBeInTheDocument()
  })

  it('says why Send is off when every row is marked', () => {
    renderSheet()
    paste('kemi@')

    const button = screen.getByRole('button', { name: 'Send invitation' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Fix or remove the marked email to send.')
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

    await userEvent.click(screen.getByRole('button', { name: 'Send 3 invitations' }))

    expect(await screen.findByText('Already a member')).toBeInTheDocument()
    expect(screen.getByText('Already invited')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend instead' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeInTheDocument()
  })

  it('over the plan, says so above Send and offers to send only what fits', async () => {
    vi.mocked(client.invitations.create).mockResolvedValue({ notice: '', sent: 1, invitations: [] })
    const plan = testPlan({ limits: [{ key: 'members', included: 3, used: 2 }] })
    renderSheet(testMe('owner', { plan }))
    paste('a1@ventohomes.ng a2@ventohomes.ng')

    const button = screen.getByRole('button', { name: 'Send 2 invitations' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/You have 1 place left on your Starter plan/)
    expect(screen.getByText('No place left on your plan')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send only 1' }))

    expect(sent()?.items.map((i) => i.email)).toEqual(['a1@ventohomes.ng'])
  })

  it('cannot be sent twice while sending', async () => {
    vi.mocked(client.invitations.create).mockReturnValue(new Promise(() => undefined))
    renderSheet()
    paste('aisha@ventohomes.ng')

    const send = screen.getByRole('button', { name: 'Send invitation' })
    await userEvent.click(send)
    await userEvent.click(send)

    expect(send).toBeDisabled()
    expect(client.invitations.create).toHaveBeenCalledOnce()
  })
})
