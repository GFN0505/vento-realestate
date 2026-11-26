import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Checklist, defaultPermissions, defaultRole } from '@vento/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shellUi } from '@/features/shell/shell-ui'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { canSeeChecklist, checklistQuery } from './checklist-queries'
import { SetupChecklist } from './setup-checklist'

const checklist = (overrides: Partial<Checklist> = {}): Checklist => ({
  shown: true,
  hidden: false,
  allDone: false,
  items: [
    { key: 'organization', done: true, detail: 'Lekki Partners Ltd' },
    { key: 'first_entity', done: true, detail: 'Parkview Residences SPV Ltd' },
    { key: 'two_step', done: true, detail: 'On for you' },
    { key: 'invite_team', done: false, detail: null },
  ],
  ...overrides,
})

function renderChecklist(data: Checklist) {
  return renderWithMe(<SetupChecklist />, testMe('owner'), undefined, (queryClient) =>
    queryClient.setQueryData(checklistQuery().queryKey, data),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('SetupChecklist', () => {
  it('shows progress, what is done and the one open step', () => {
    renderChecklist(checklist())

    expect(screen.getByRole('heading', { name: 'Finish setting up' })).toBeInTheDocument()
    expect(screen.getByText('3 of 4 done')).toBeInTheDocument()
    expect(screen.getByText('Parkview Residences SPV Ltd')).toBeInTheDocument()
    expect(screen.getByText('Bring in finance, sales and site staff')).toBeInTheDocument()
  })

  it('opens the invite sheet over Home from Invite people', async () => {
    const open = vi.spyOn(shellUi, 'openInvite').mockImplementation(() => undefined)
    renderChecklist(checklist())

    await userEvent.click(screen.getByRole('button', { name: 'Invite people' }))

    expect(open).toHaveBeenCalledOnce()
  })

  it('says so when everything is done, with Hide checklist', () => {
    const items = checklist().items.map((item) => ({ ...item, done: true }))
    renderChecklist(checklist({ items, allDone: true }))

    expect(screen.getByText(/You're set up/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide checklist' })).toBeInTheDocument()
  })

  it('draws nothing once hidden', () => {
    renderChecklist(checklist({ shown: false, hidden: true }))

    expect(screen.queryByRole('heading', { name: 'Finish setting up' })).not.toBeInTheDocument()
  })
})

describe('canSeeChecklist', () => {
  const access = (key: 'owner' | 'admin' | 'sales') => ({
    permissions: defaultPermissions(defaultRole(key)),
  })

  it('is for owners and admins, never for sales or an owner previewing sales', () => {
    expect(canSeeChecklist(access('owner'))).toBe(true)
    expect(canSeeChecklist(access('admin'))).toBe(true)
    // A preview narrows to the previewed role's permissions.
    expect(canSeeChecklist(access('sales'))).toBe(false)
  })
})
