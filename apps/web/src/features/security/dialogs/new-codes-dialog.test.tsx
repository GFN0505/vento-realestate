import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AUTH_ERROR_MESSAGES } from '@vento/shared'
import { describe, expect, it, vi } from 'vitest'
import { authClient } from '@/lib/auth-client'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { NewCodesDialog } from './new-codes-dialog'

vi.mock('@/lib/auth-client', () => ({
  authClient: { twoFactor: { generateBackupCodes: vi.fn() } },
}))

describe('New backup codes for a super-admin', () => {
  it('says a fresh code or passkey is needed and keeps the password', async () => {
    vi.mocked(authClient.twoFactor.generateBackupCodes).mockResolvedValue({
      data: null,
      error: { code: 'SECOND_FACTOR_REQUIRED', status: 403 },
    } as never)
    const me = testMe('viewer', { console: { twoStepOn: true } })
    renderWithMe(<NewCodesDialog open onClose={vi.fn()} email={me.user.email} />, me)
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse 42{Enter}')
    expect(await screen.findByText(AUTH_ERROR_MESSAGES.SECOND_FACTOR_REQUIRED)).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('correct horse 42')
  })
})
