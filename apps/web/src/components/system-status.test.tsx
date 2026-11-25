import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SystemStatus } from './system-status'

const time = '2026-11-25T09:00:00.000Z'

describe('SystemStatus', () => {
  it('shows the API and database as connected when both are up', () => {
    render(<SystemStatus state="ready" health={{ status: 'ok', database: 'up', time }} />)

    expect(screen.getByRole('heading', { name: 'Vento' })).toBeInTheDocument()
    expect(screen.getAllByText('Connected')).toHaveLength(2)
  })

  it('says when the database is down but the API answered', () => {
    render(<SystemStatus state="ready" health={{ status: 'degraded', database: 'down', time }} />)

    expect(screen.getByText("Can't reach the database")).toBeInTheDocument()
  })

  it('says when the API cannot be reached', () => {
    render(<SystemStatus state="unreachable" />)

    expect(screen.getByText("Can't reach the API")).toBeInTheDocument()
  })
})
