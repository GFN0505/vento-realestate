import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { NameField } from './name-field'

const api = vi.hoisted(() => ({ updateName: vi.fn() }))
vi.mock('@/lib/orpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orpc')>()),
  client: { account: api },
}))
// A save refetches `me`, which fails in jsdom; keep the app online so no probe marks it offline.
vi.mock('@/lib/connection', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/connection')>()
  return {
    ...real,
    connection: { ...real.connection, isOnline: () => true, reportNetworkFailure: () => {} },
  }
})

function renderName() {
  return renderWithMe(
    <TooltipProvider>
      <NameField name="Grace Umeh" />
    </TooltipProvider>,
    testMe('sales'),
  )
}

const edit = () => userEvent.click(screen.getByRole('button', { name: /Edit your name/ }))

beforeEach(() => vi.clearAllMocks())

describe('your name, edited in place', () => {
  it('saves on Enter', async () => {
    api.updateName.mockResolvedValue({ name: 'Grace Umeh-Obi', notice: 'Name updated' })
    renderName()
    await edit()
    const box = screen.getByLabelText('Your name')
    await userEvent.clear(box)
    await userEvent.type(box, 'Grace Umeh-Obi{Enter}')

    expect(api.updateName).toHaveBeenCalledWith({ name: 'Grace Umeh-Obi' })
    expect(await screen.findByRole('button', { name: /Edit your name/ })).toBeInTheDocument()
  })

  it('cancels on Esc without saving', async () => {
    renderName()
    await edit()
    await userEvent.type(screen.getByLabelText('Your name'), 'xyz{Escape}')

    expect(api.updateName).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Grace Umeh\. Edit your name/ })).toBeInTheDocument()
  })

  it('keeps what was typed and says what is needed for an empty name', async () => {
    renderName()
    await edit()
    await userEvent.clear(screen.getByLabelText('Your name'))
    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name')
    expect(api.updateName).not.toHaveBeenCalled()
  })

  it('saves when leaving the field', async () => {
    api.updateName.mockResolvedValue({ name: 'Grace U.', notice: 'Name updated' })
    renderName()
    await edit()
    const box = screen.getByLabelText('Your name')
    await userEvent.clear(box)
    await userEvent.type(box, 'Grace U.')
    await userEvent.tab()

    await waitFor(() => expect(api.updateName).toHaveBeenCalledWith({ name: 'Grace U.' }))
  })
})
