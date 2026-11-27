import { ORPCError } from '@orpc/client'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { consoleClient } from '../api'
import { InviteSheet } from './invite-sheet'

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  consoleClient: {
    console: {
      superAdmins: {
        invite: { preview: vi.fn(), apply: vi.fn() },
        resendInvitation: vi.fn(),
      },
    },
  },
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const invite = vi.mocked(consoleClient.console.superAdmins.invite.preview)
const resend = vi.mocked(consoleClient.console.superAdmins.resendInvitation)
afterEach(() => vi.clearAllMocks())

async function fill() {
  await userEvent.type(screen.getByLabelText('Email'), 'Tunde@VentoERP.com')
  await userEvent.type(screen.getByLabelText('Name'), 'Tunde Bello')
  await userEvent.click(screen.getByRole('button', { name: 'Review' }))
}

describe('Invite super-admin', () => {
  it('previews with the email in lower case and asks for a reason', async () => {
    invite.mockResolvedValue({
      lines: [{ text: 'Tunde Bello (tunde@ventoerp.com) gets an email to join.', tone: 'info' }],
      expected: {},
    })
    renderWithMe(<InviteSheet onClose={vi.fn()} />, testMe('viewer'))
    await fill()
    expect(invite).toHaveBeenCalledWith({ email: 'tunde@ventoerp.com', name: 'Tunde Bello' })
    expect(await screen.findByText(/gets an email to join/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled()
  })

  it('offers Resend when an invitation is already open for that email', async () => {
    invite.mockRejectedValue(
      new ORPCError('CONFLICT', {
        message: 'tunde@ventoerp.com already has an invitation that expires 29 Nov 2026, 14:30.',
        data: {
          reason: 'platform_refused',
          next: 'resend_invitation',
          invitationId: '019a0000-0000-7000-8000-000000000009',
        },
      }),
    )
    resend.mockResolvedValue({ message: 'Invitation resent' })
    renderWithMe(<InviteSheet onClose={vi.fn()} />, testMe('viewer'))
    await fill()
    await userEvent.click(await screen.findByRole('button', { name: 'Resend' }))
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: '019a0000-0000-7000-8000-000000000009' }),
    )
  })

  it('says what each field needs before sending anything', async () => {
    renderWithMe(<InviteSheet onClose={vi.fn()} />, testMe('viewer'))
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Enter an email address, like tunde@ventoerp.com')).toBeInTheDocument()
    expect(screen.getByText("Enter the person's name")).toBeInTheDocument()
    expect(invite).not.toHaveBeenCalled()
  })
})
