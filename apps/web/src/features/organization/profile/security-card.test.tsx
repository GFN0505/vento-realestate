import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OrganizationSecurity } from '@vento/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { organizationSecurityQuery } from './organization-queries'
import { SecurityCard } from './security-card'

const set = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/orpc', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/orpc')>()
  return {
    ...real,
    orpc: new Proxy(real.orpc, {
      get(target, key) {
        if (key !== 'organization') return Reflect.get(target, key)
        const organization = Reflect.get(target, key) as object
        return new Proxy(organization, {
          get: (inner, name) =>
            name === 'setTwoStepRequired'
              ? { mutationOptions: (o: object) => ({ ...o, mutationFn: set }) }
              : Reflect.get(inner, name),
        })
      },
    }),
  }
})
vi.mock('@/lib/connection', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/connection')>()
  return {
    ...real,
    connection: { ...real.connection, isOnline: () => true, reportNetworkFailure: () => {} },
  }
})

const security = (overrides: Partial<OrganizationSecurity> = {}): OrganizationSecurity => ({
  required: false,
  changedAt: null,
  changedByName: null,
  withTwoStep: 9,
  people: 12,
  withoutTwoStep: { names: ['Grace Umeh', 'Kunle Ojo'], others: 1 },
  canChange: true,
  ...overrides,
})

function renderCard(role: 'owner' | 'admin', data = security({ canChange: role === 'owner' })) {
  return renderWithMe(<SecurityCard />, testMe(role), undefined, (qc) =>
    qc.setQueryData(organizationSecurityQuery().queryKey, data),
  )
}

const toggle = () => screen.getByRole('switch', { name: 'Require two-step sign-in for everyone' })

beforeEach(() => vi.clearAllMocks())

describe('the Organization Security card', () => {
  it('shows owners the switch and how many people have two-step', () => {
    renderCard('owner')

    expect(toggle()).toBeEnabled()
    expect(screen.getByText(/have two-step on/)).toHaveTextContent(
      '9 of 12 people have two-step on',
    )
  })

  it('is read-only for admins, saying who can change it', () => {
    renderCard('admin')

    expect(toggle()).toBeDisabled()
    expect(screen.getByText('Only owners can change this.')).toBeInTheDocument()
  })

  it('names who has not set it up before turning it on', async () => {
    set.mockResolvedValue({ ...security({ required: true }), notice: 'done', changedByOther: null })
    renderCard('owner')
    await userEvent.click(toggle())

    const confirm = screen.getByRole('alertdialog', { name: 'Require two-step for everyone?' })
    expect(confirm).toHaveTextContent('Grace Umeh, Kunle Ojo and 1 other')
    await userEvent.click(screen.getByRole('button', { name: 'Require two-step' }))

    expect(set.mock.calls[0]?.[0]).toEqual({ required: true, seenChangedAt: null })
  })

  it('explains who still needs it before turning it off', async () => {
    renderCard('owner', security({ required: true }))
    await userEvent.click(toggle())

    expect(
      screen.getByRole('alertdialog', { name: 'Stop requiring two-step for everyone?' }),
    ).toHaveTextContent('Owners, admins, finance and HR still need it.')
  })

  it('says another owner changed it a moment ago', async () => {
    set.mockResolvedValue({
      ...security({ required: true }),
      notice: 'Two-step is now required',
      changedByOther: 'Olumide Bankole changed this a moment ago.',
    })
    renderCard('owner')
    await userEvent.click(toggle())
    await userEvent.click(screen.getByRole('button', { name: 'Require two-step' }))

    await vi.waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Olumide Bankole changed this a moment ago.'),
    )
  })
})
