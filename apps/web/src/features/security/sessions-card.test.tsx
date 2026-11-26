import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionsCard } from './sessions-card'
import { testSession } from './test-data'

const renderCard = (sessions: Parameters<typeof SessionsCard>[0]['sessions']) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionsCard sessions={sessions} />
    </QueryClientProvider>,
  )

describe('Where you are signed in', () => {
  it('lists this device first, without a Sign out of its own', () => {
    renderCard([
      testSession({ id: 'a', device: 'iPhone', browser: 'Safari' }),
      testSession({ id: 'b', isCurrent: true }),
    ])

    const rows = within(screen.getByRole('list', { name: 'Devices' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Chrome on Mac')
    expect(rows[0]).toHaveTextContent('This device')
    expect(within(rows[0] as HTMLElement).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out Safari on iPhone' })).toBeInTheDocument()
    expect(screen.getByText('Signed in on 2 devices')).toBeInTheDocument()
  })

  it('leaves the place out when it is unknown', () => {
    renderCard([testSession({ isCurrent: true, place: null })])

    expect(screen.getByText(/IP 102\.89\.34\.x/)).toBeInTheDocument()
    expect(screen.queryByText(/Lekki/)).not.toBeInTheDocument()
  })

  it('offers Sign out other devices only when there are others', () => {
    renderCard([testSession({ isCurrent: true })])

    expect(screen.queryByRole('button', { name: 'Sign out other devices' })).not.toBeInTheDocument()
  })
})
