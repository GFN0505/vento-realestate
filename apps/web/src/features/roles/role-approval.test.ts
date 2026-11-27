import type { ApprovalRuleRow, ApprovalRulesList } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { approvesText, changeLine } from './role-approval'

const FINANCE = 'role-finance'
const MD = 'role-md'

const rule = (over: Partial<ApprovalRuleRow>): ApprovalRuleRow => ({
  id: 'r1',
  version: 1,
  actionKey: 'access.role.update',
  minAmount: null,
  whenText: 'Any amount',
  steps: [],
  chain: '',
  entities: 'all',
  extraCondition: null,
  gaps: [],
  updatedAt: '2026-11-27T10:00:00.000Z',
  ...over,
})

describe('role approvals', () => {
  it('lists every rule step the role approves', () => {
    const groups: ApprovalRulesList['items'] = [
      {
        actionKey: 'access.role.update',
        label: "Change a role's permissions",
        module: 'settings',
        belowThreshold: null,
        rules: [
          rule({
            steps: [
              { position: 1, roles: [{ id: FINANCE, name: 'Finance' }], text: 'Finance' },
              { position: 2, roles: [{ id: MD, name: 'MD' }], text: 'MD' },
            ],
          }),
        ],
      },
    ]
    expect(approvesText(groups, MD)).toBe("Change a role's permissions (step 2)")
    expect(approvesText(groups, 'role-sales')).toBeNull()
  })

  it('names what a change adds and removes, per module', () => {
    expect(changeLine({ module: 'projects', added: ['approve'], removed: ['delete'] })).toBe(
      'Projects & construction: Approve added; Delete removed',
    )
  })
})
