import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cannotApproveInModuleText, type Role } from '@vento/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { client } from '@/lib/orpc'
import { testMe, testRoles } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { RuleSheet } from './rule-sheet'

vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return {
    ...actual,
    client: { approvalRules: { create: vi.fn(), update: vi.fn(), delete: vi.fn() } },
  }
})

const OWNER = '01900000-0000-7000-8000-0000000000c1'
const ADMIN = '01900000-0000-7000-8000-0000000000c2'
const ids: Record<string, string> = { owner: OWNER, admin: ADMIN }

// Owner and Admin approve in Settings; nobody else does.
const roles: Role[] = testRoles().map((role, i) => ({
  ...role,
  id: ids[role.key ?? ''] ?? `01900000-0000-7000-8000-0000000000d${i}`,
  canApprove: role.key === 'owner' || role.key === 'admin' ? ['settings'] : [],
}))

function renderSheet() {
  return renderWithMe(<RuleSheet target="new" onClose={vi.fn()} />, testMe('owner'), roles, (qc) =>
    qc.setQueryData(entitiesQuery().queryKey, {
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
      counts: { active: 0, archived: 0 },
    }),
  )
}

const step = (n: number) => screen.getByRole('group', { name: `Step ${n} roles` })

afterEach(() => vi.mocked(client.approvalRules.create).mockReset())

describe('RuleSheet', () => {
  it('lists roles without Approve in the action module as unavailable, saying why', () => {
    renderSheet()
    const finance = within(step(1)).getByRole('button', { name: 'Finance' })
    expect(finance).toHaveAttribute('aria-disabled', 'true')
    expect(finance).toHaveAccessibleDescription(cannotApproveInModuleText('Finance', 'settings'))
    expect(within(step(1)).getByRole('button', { name: 'Owner' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('lets an owner add up to three steps', async () => {
    renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }))
    expect(step(3)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Add a step' })).toBeNull()
  })

  it('asks for an approver before saving', async () => {
    renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }))
    expect(await screen.findByText('Choose at least one role for each step')).toBeVisible()
    expect(client.approvalRules.create).not.toHaveBeenCalled()
  })

  it('saves the steps in order, for every company', async () => {
    vi.mocked(client.approvalRules.create).mockResolvedValue(
      // The sheet only needs the call to succeed.
      { notice: 'Rule saved' } as Awaited<ReturnType<typeof client.approvalRules.create>>,
    )
    renderSheet()
    await userEvent.click(within(step(1)).getByRole('button', { name: 'Owner' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }))
    await userEvent.click(within(step(2)).getByRole('button', { name: 'Admin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }))
    await vi.waitFor(() =>
      expect(client.approvalRules.create).toHaveBeenCalledWith({
        actionKey: 'access.role.update',
        when: { kind: 'any' },
        steps: [[OWNER], [ADMIN]],
        entityIds: 'all',
      }),
    )
  })

  it('always shows that the requester can never approve', () => {
    renderSheet()
    const tick = screen.getByRole('checkbox', {
      name: "Requester can't approve, even if their role allows",
    })
    expect(tick).toBeChecked()
    expect(tick).toBeDisabled()
  })
})
