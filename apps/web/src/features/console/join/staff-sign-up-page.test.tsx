import { screen } from '@testing-library/react'
import type { StaffJoinPreview } from '@vento/shared/console'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { StaffSignUpPage } from './staff-sign-up-page'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/sign-in">{children}</a>,
}))
vi.mock('./join-client', () => ({ joinClient: { console: { join: { start: vi.fn() } } } }))

// The brand panel's motion reads media queries; jsdom has none.
beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList
})

const pending: StaffJoinPreview = {
  status: 'pending',
  email: 'tunde@ventoerp.com',
  name: 'Tunde Bello',
  inviterName: 'Ada Okafor',
  expiresAt: '2026-11-29T13:30:00Z',
  resume: false,
}
const signedOut = testMe('viewer')

describe('the staff sign-up', () => {
  it('asks a new person for their name and a password', () => {
    renderWithMe(<StaffSignUpPage token="t" preview={pending} me={null} />, signedOut)
    expect(
      screen.getByRole('heading', { name: 'Join the Vento Real Estate console' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ada Okafor invited you as a super-admin.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Tunde Bello')
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
  })

  it('asks only for the password when resuming', () => {
    renderWithMe(
      <StaffSignUpPage token="t" preview={{ ...pending, resume: true }} me={null} />,
      signedOut,
    )
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('names the inviter on an expired link and offers sign-in on a used one', () => {
    const { unmount } = renderWithMe(
      <StaffSignUpPage token="t" preview={{ ...pending, status: 'expired' }} me={null} />,
      signedOut,
    )
    expect(screen.getByText('Ask Ada Okafor to send a new one.')).toBeInTheDocument()
    unmount()
    renderWithMe(
      <StaffSignUpPage token="t" preview={{ ...pending, status: 'accepted' }} me={null} />,
      signedOut,
    )
    expect(
      screen.getByRole('heading', { name: 'This invitation has already been used' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('asks someone signed in as another person to sign out first', () => {
    const olumide = testMe('owner', {
      user: { ...signedOut.user, email: 'olumide@ventohomes.ng' },
    })
    renderWithMe(<StaffSignUpPage token="t" preview={pending} me={olumide} />, olumide)
    expect(
      screen.getByText(
        "You're signed in as olumide@ventohomes.ng. Sign out to accept this staff invitation.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out and continue' })).toBeInTheDocument()
  })
})
