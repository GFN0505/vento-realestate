import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { meQuery } from '@/features/account/api'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { TwoStepSetupHost } from './two-step-banner'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))
vi.mock('@/features/shell/use-shell-actions', () => ({
  useShellActions: () => ({ signOut: vi.fn() }),
}))

describe('two-step required over the page', () => {
  it('always offers Sign out, and closes once me is ready again', async () => {
    const { queryClient } = renderWithMe(
      <TwoStepSetupHost />,
      testMe('sales', { nextStep: 'two_step_setup' }),
    )

    expect(
      await screen.findByRole('dialog', { name: 'Set up two-step sign-in' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()

    act(() => queryClient.setQueryData(meQuery().queryKey, testMe('sales')))

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Set up two-step sign-in' }),
      ).not.toBeInTheDocument(),
    )
  })
})
