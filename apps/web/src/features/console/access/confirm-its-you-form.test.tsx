import { ORPCError } from '@orpc/client'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ConsoleStatus } from '@vento/shared/console'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '@/lib/auth-errors'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { consoleClient } from '../api'
import { consoleGate } from '../gate/console-gate'
import { ConfirmItsYouForm } from './confirm-its-you-form'
import { PASSKEY_CANCELLED, passkeyAssertion } from './passkey-proof'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  consoleClient: { console: { access: { confirm: vi.fn() } } },
}))
vi.mock('./passkey-proof', async (original) => ({
  ...(await original<typeof import('./passkey-proof')>()),
  passkeyAssertion: vi.fn(),
}))

const open: ConsoleStatus = {
  window: 'open',
  closesAt: '2026-11-26T12:00:00Z',
  freshProof: true,
  methods: { passkey: true },
}
const confirm = vi.mocked(consoleClient.console.access.confirm)
const me = testMe('viewer', { console: { twoStepOn: true } })

beforeEach(() => {
  Object.defineProperty(window, 'PublicKeyCredential', { value: () => {}, configurable: true })
})
afterEach(() => {
  confirm.mockReset()
  consoleGate.reset()
})

describe("Confirm it's you", () => {
  it('offers the passkey first, and a code instead', async () => {
    renderWithMe(<ConfirmItsYouForm passkey />, me)
    expect(screen.getByRole('button', { name: 'Use passkey' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use a code instead' }))
    expect(screen.getByLabelText('Code from your authenticator app')).toBeInTheDocument()
  })

  it('opens the console once six digits are typed', async () => {
    confirm.mockResolvedValue(open)
    renderWithMe(<ConfirmItsYouForm passkey={false} />, me)
    await userEvent.type(screen.getByLabelText('Code from your authenticator app'), '482135')
    expect(confirm).toHaveBeenCalledWith({ method: 'code', code: '482135' })
    expect(consoleGate.isOpen()).toBe(true)
  })

  it('says the code was wrong and clears it', async () => {
    confirm.mockRejectedValue(new ORPCError('BAD_REQUEST', { data: { reason: 'wrong_code' } }))
    renderWithMe(<ConfirmItsYouForm passkey={false} />, me)
    await userEvent.type(screen.getByLabelText('Code from your authenticator app'), '000000')
    expect(await screen.findByText(COPY.wrongCode)).toBeInTheDocument()
    expect(consoleGate.isOpen()).toBe(false)
  })

  it('takes a backup code instead', async () => {
    confirm.mockResolvedValue(open)
    renderWithMe(<ConfirmItsYouForm passkey={false} />, me)
    await userEvent.click(screen.getByRole('button', { name: 'Use a backup code' }))
    await userEvent.type(screen.getByLabelText('Backup code'), ' abcd-efgh {Enter}')
    expect(confirm).toHaveBeenCalledWith({ method: 'backup_code', code: 'abcd-efgh' })
  })

  it('says nothing when the passkey prompt is dismissed', async () => {
    vi.mocked(passkeyAssertion).mockResolvedValue(PASSKEY_CANCELLED)
    renderWithMe(<ConfirmItsYouForm passkey />, me)
    await userEvent.click(screen.getByRole('button', { name: 'Use passkey' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
