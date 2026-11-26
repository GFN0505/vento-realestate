import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))
vi.mock('@/lib/passkey-support', () => ({
  browserSupportsPasskeys: () => true,
  supportsPasskeyAutofill: async () => false,
}))

const { PasswordStep } = await import('./password-step')

describe('the sign-in form', () => {
  it('offers saved passkeys in the email suggestions and a passkey button', () => {
    render(<PasswordStep onResult={() => {}} onPasskeySignedIn={() => {}} />)

    expect(screen.getByLabelText('Work email')).toHaveAttribute('autocomplete', 'username webauthn')
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeInTheDocument()
  })
})
