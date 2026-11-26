import { ORPCError } from '@orpc/client'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shellUi } from '@/features/shell/shell-ui'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { CompanySheet } from './company-sheet'

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  restore: vi.fn(),
  archive: vi.fn(),
  archivePreview: vi.fn(),
}))
vi.mock('@/lib/orpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orpc')>()),
  client: { entities: api },
}))
vi.mock('@/features/entity/use-current-entity', () => ({
  useCurrentEntity: () => ({ select: vi.fn() }),
}))

const saved = { id: 'new', name: 'Lekki Pearl Estates Ltd' }

function renderSheet(me = testMe('admin')) {
  const view = renderWithMe(<CompanySheet />, me)
  act(() => shellUi.openCompany({ mode: 'add' }))
  return view
}

const nameBox = () => screen.findByLabelText('Company name')

beforeEach(() => vi.clearAllMocks())
afterEach(() => act(() => shellUi.close('company')))

describe('the Add company sheet', () => {
  it('tidies the RC number on blur', async () => {
    renderSheet()
    await userEvent.type(await screen.findByLabelText('RC number'), 'rc-1789234')

    await userEvent.tab()

    expect(screen.getByLabelText('RC number')).toHaveValue('RC 1789234')
  })

  it('warns about an odd TIN but still lets the company be added', async () => {
    api.create.mockResolvedValue({ ...saved })
    renderSheet()
    await userEvent.type(await nameBox(), 'Lekki Pearl Estates Ltd')
    await userEvent.type(screen.getByLabelText('TIN'), '123')
    await userEvent.tab()
    expect(screen.getByText(/TINs are usually/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add company' }))

    await waitFor(() => expect(api.create).toHaveBeenCalledOnce())
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({ name: 'Lekki Pearl Estates Ltd' })
  })

  it('refuses a blank name with a message and sends nothing', async () => {
    renderSheet()
    await nameBox()

    await userEvent.click(screen.getByRole('button', { name: 'Add company' }))

    expect(await screen.findByText('Enter at least 2 characters')).toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('puts an RC clash on the field and offers Restore it instead when the other company is archived', async () => {
    api.create.mockRejectedValue(
      new ORPCError('CONFLICT', {
        message: 'Ikoyi Crest SPV Ltd (archived) already uses RC 1832276.',
        data: {
          reason: 'rc_number_taken',
          entity: { id: 'ikoyi', name: 'Ikoyi Crest SPV Ltd', archived: true },
        },
      }),
    )
    api.restore.mockResolvedValue({})
    renderSheet()
    await userEvent.type(await nameBox(), 'Ikoyi Again Ltd')
    await userEvent.click(screen.getByRole('button', { name: 'Add company' }))

    expect(await screen.findByText(/already uses RC 1832276/)).toBeInTheDocument()
    expect(screen.getByLabelText('Company name')).toHaveValue('Ikoyi Again Ltd')
    await userEvent.click(screen.getByRole('button', { name: 'Restore it instead' }))

    await waitFor(() => expect(api.restore).toHaveBeenCalledWith({ id: 'ikoyi' }))
  })

  it('does not offer Restore it instead when the RC belongs to an active company', async () => {
    api.create.mockRejectedValue(
      new ORPCError('CONFLICT', {
        message: 'Parkview Residences SPV Ltd already uses RC 1789234.',
        data: {
          reason: 'rc_number_taken',
          entity: { id: 'pv', name: 'Parkview Residences SPV Ltd', archived: false },
        },
      }),
    )
    renderSheet()
    await userEvent.type(await nameBox(), 'Another Ltd')
    await userEvent.click(screen.getByRole('button', { name: 'Add company' }))

    expect(await screen.findByText(/already uses RC 1789234/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore it instead' })).not.toBeInTheDocument()
  })

  it('does not offer Restore it instead to someone limited to some companies', async () => {
    api.create.mockRejectedValue(
      new ORPCError('CONFLICT', {
        message: 'Ikoyi Crest SPV Ltd (archived) already uses RC 1832276.',
        data: {
          reason: 'rc_number_taken',
          entity: { id: 'ikoyi', name: 'Ikoyi Crest SPV Ltd', archived: true },
        },
      }),
    )
    const base = testMe('admin')
    const limited = base.member ? { ...base, member: { ...base.member, entityIds: ['pv'] } } : base
    renderSheet(limited)
    await userEvent.type(await nameBox(), 'Ikoyi Again Ltd')
    await userEvent.click(screen.getByRole('button', { name: 'Add company' }))

    expect(await screen.findByText(/already uses RC 1832276/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore it instead' })).not.toBeInTheDocument()
  })

  it('keeps what was typed and says who to ask when the plan limit refuses', async () => {
    api.create.mockRejectedValue(
      new ORPCError('FORBIDDEN', {
        message:
          'Your organization has reached its limit of 2 active companies. Ask Olumide Bankole (owner).',
        data: { reason: 'plan_limit', limit: 'entities' },
      }),
    )
    renderSheet()
    await userEvent.type(await nameBox(), 'Third Company Ltd')
    await userEvent.click(screen.getByRole('button', { name: 'Add company' }))

    expect(await screen.findByText(/Ask Olumide Bankole \(owner\)/)).toBeInTheDocument()
    expect(screen.getByLabelText('Company name')).toHaveValue('Third Company Ltd')
    expect(screen.getByRole('button', { name: 'Add company' })).toBeEnabled()
  })

  it('asks before discarding typed details', async () => {
    renderSheet()
    await userEvent.type(await nameBox(), 'Half typed')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Discard your changes?')).toBeInTheDocument()
  })
})
