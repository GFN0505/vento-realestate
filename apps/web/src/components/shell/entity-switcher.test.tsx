import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entity } from '@vento/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAddCompany } from '@/features/companies/open-add-company'
import type { CurrentEntity } from '@/features/entity/use-current-entity'
import { clearPreview, startPreview } from '@/features/preview/preview-role'
import { testMe, testRoles } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { EntitySwitcher } from './entity-switcher'

const current = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/features/entity/use-current-entity', () => ({
  useCurrentEntity: () => current.value,
}))
vi.mock('@/features/companies/open-add-company', () => ({ openAddCompany: vi.fn() }))

const company = (name: string): Entity => ({
  id: `id-${name}`,
  name,
  type: 'spv',
  rcNumber: null,
  tin: null,
  vatRegistered: false,
  baseCurrency: 'NGN',
  status: 'active',
  archivedAt: null,
  archivedByName: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

function setCurrent(overrides: Partial<CurrentEntity>) {
  const options = overrides.options ?? [company('Parkview Residences SPV Ltd')]
  current.value = {
    entity: null,
    locked: false,
    invalid: false,
    noCompany: false,
    options,
    status: 'success',
    refetch: vi.fn(),
    select: vi.fn(),
    ...overrides,
  } satisfies CurrentEntity
}

/** Hover first so the lazy menu has loaded, then press: the menu opens on the real trigger. */
async function openSwitcher() {
  await userEvent.hover(screen.getByRole('button', { name: /Company/ }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Company/ })).toHaveAttribute('data-state'),
  )
  await userEvent.click(screen.getByRole('button', { name: /Company/ }))
}

afterEach(() => {
  clearPreview()
  vi.clearAllMocks()
})

describe('EntitySwitcher', () => {
  it('labels the control "Company" and reads All companies when nothing is picked', () => {
    setCurrent({ options: [company('A Ltd'), company('B Ltd')] })
    renderWithMe(<EntitySwitcher />, testMe('owner'))

    const trigger = screen.getByRole('button', { name: /Company/ })
    expect(trigger).toHaveTextContent('All companies')
    expect(screen.queryByText(/entit/i)).not.toBeInTheDocument()
  })

  it('shows an owner with one company a menu that offers Add company', async () => {
    const parkview = company('Parkview Residences SPV Ltd')
    setCurrent({ entity: parkview, locked: true, options: [parkview] })
    renderWithMe(<EntitySwitcher />, testMe('owner'))

    await openSwitcher()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add company' }))

    expect(openAddCompany).toHaveBeenCalledOnce()
  })

  it('shows a one-company member who cannot add a plain label with no menu', () => {
    const parkview = company('Parkview Residences SPV Ltd')
    setCurrent({ entity: parkview, locked: true, options: [parkview] })
    renderWithMe(<EntitySwitcher />, testMe('sales'))

    expect(screen.getByText('Parkview Residences SPV Ltd')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Company/ })).not.toBeInTheDocument()
  })

  it('offers Add company only when the server says the member can add one', async () => {
    setCurrent({ options: [company('A Ltd'), company('B Ltd')] })
    renderWithMe(<EntitySwitcher />, testMe('admin', { canAddCompany: false }))

    await openSwitcher()

    expect(await screen.findByRole('menuitemradio', { name: /A Ltd/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Add company' })).not.toBeInTheDocument()
  })

  it('hides Add company while previewing a role that cannot add companies', async () => {
    setCurrent({ options: [company('A Ltd'), company('B Ltd')] })
    const roles = testRoles()
    const sales = roles.find((r) => r.key === 'sales')
    if (!sales) throw new Error('no sales role')
    startPreview('org-a', sales.id)
    renderWithMe(<EntitySwitcher />, testMe('owner'), roles)

    await openSwitcher()

    expect(await screen.findByRole('menuitemradio', { name: /A Ltd/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Add company' })).not.toBeInTheDocument()
  })

  it('reads No company when every company they can see is archived, with no menu', () => {
    setCurrent({ options: [], noCompany: true })
    renderWithMe(<EntitySwitcher />, testMe('project_manager', { canAddCompany: false }))

    expect(screen.getByText('No company')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Company/ })).not.toBeInTheDocument()
  })

  it('picking a company selects it', async () => {
    const select = vi.fn()
    const a = company('A Ltd')
    setCurrent({ options: [a, company('B Ltd')], select })
    renderWithMe(<EntitySwitcher />, testMe('owner'))

    await openSwitcher()
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /A Ltd/ }))

    expect(select).toHaveBeenCalledWith(a.id)
  })
})
