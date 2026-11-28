import { describe, expect, it } from 'vitest'
import { defaultRoleAllows, SYSTEM_ROLE_KEYS } from '../access/default-roles'
import { PERMISSION_MODULES } from '../access/permissions'
import { Decimal } from '../common/decimal'
import { FEATURE_KEYS } from '../features/catalog'
import {
  APPROVAL_ACTION_KEYS,
  APPROVAL_ACTIONS,
  isApprovalActionKey,
  RULE_ACTION_KEYS,
  ruleActionKey,
} from './catalog'

const entries = APPROVAL_ACTION_KEYS.map((k) => [k, APPROVAL_ACTIONS[k]] as const)

describe('approvals catalog', () => {
  it('uses keys shaped like module.record.action', () => {
    for (const key of APPROVAL_ACTION_KEYS) expect(key).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+$/)
  })

  it.each(entries)('files %s under a permission module', (_key, meta) => {
    expect(PERMISSION_MODULES).toContain(meta.module)
  })

  it.each(entries)('gives %s a label, a chip and an approve button', (_key, meta) => {
    expect(meta.label).not.toBe('')
    expect(meta.doing).not.toBe('')
    expect(meta.chip).not.toBe('')
    expect(
      meta.approveLabel({ title: 'T', recordLabel: 'Aisha Bello', amountText: null }),
    ).not.toBe('')
  })

  it.each(entries)(
    'has %s defaults name only built-in roles that can approve in its module',
    (_key, meta) => {
      for (const rule of meta.defaults) {
        expect(rule.steps.length).toBeGreaterThanOrEqual(1)
        expect(rule.steps.length).toBeLessThanOrEqual(3)
        for (const step of rule.steps) {
          expect(step.length).toBeGreaterThanOrEqual(1)
          for (const role of step) {
            expect(SYSTEM_ROLE_KEYS).toContain(role)
            expect(
              defaultRoleAllows(role, meta.module, 'approve'),
              `${role} in ${meta.module}`,
            ).toBe(true)
          }
        }
      }
    },
  )

  it.each(entries)('gives %s thresholds only when it has an amount', (_key, meta) => {
    for (const rule of meta.defaults) {
      if (rule.minAmount === null) continue
      expect(meta.hasAmount).toBe(true)
      expect(new Decimal(rule.minAmount).gt(0)).toBe(true)
    }
  })

  it('points rulesFrom only at actions with rules of their own, and gives such actions no defaults', () => {
    for (const [key, meta] of entries) {
      if (meta.rulesFrom === null) continue
      expect(APPROVAL_ACTIONS[meta.rulesFrom].rulesFrom, key).toBeNull()
      expect(APPROVAL_ACTIONS[meta.rulesFrom].module, key).toBe(meta.module)
      expect(meta.defaults, key).toEqual([])
    }
  })

  it.each(entries)('says what %s does without a rule, and which feature it needs', (key, meta) => {
    expect(['run', 'refuse']).toContain(meta.whenNoRule)
    if (meta.feature !== null) expect(FEATURE_KEYS).toContain(meta.feature)
    // Platform actions are in every plan; module actions belong to their module's feature.
    expect(meta.feature === null, key).toBe(key.startsWith('access.'))
  })

  it('keeps 0024 for the platform actions: no rule, no approval', () => {
    expect(APPROVAL_ACTIONS['access.role.update'].whenNoRule).toBe('run')
    expect(APPROVAL_ACTIONS['access.member.make_owner'].whenNoRule).toBe('run')
    expect(APPROVAL_ACTIONS['access.invitation.owner'].whenNoRule).toBe('run')
  })

  it('never clears an encumbrance on one person’s word (decision 0026)', () => {
    const meta = APPROVAL_ACTIONS['land.encumbrance.clear']
    expect(meta).toMatchObject({
      module: 'land',
      feature: 'land',
      whenNoRule: 'refuse',
      whenNoApprover: 'refuse',
      hasAmount: false,
    })
    expect(meta.defaults).toEqual([
      { minAmount: null, steps: [['land_legal', 'finance', 'admin'], ['owner']] },
    ])
  })

  it('names the clearing effect from the request, with a plain fallback', () => {
    const meta = APPROVAL_ACTIONS['land.encumbrance.clear']
    const input = { title: 'Clear caveat · Plot 22', recordLabel: 'Caveat', amountText: null }
    expect(meta.approveLabel({ ...input, actionLabel: 'Clear caveat and unblock sales' })).toBe(
      'Clear caveat and unblock sales',
    )
    expect(meta.approveLabel(input)).toBe('Clear encumbrance')
  })

  it('ships the two brick 4 defaults: role changes by owner or admin, owners by owner', () => {
    expect(APPROVAL_ACTIONS['access.role.update'].defaults).toEqual([
      { minAmount: null, steps: [['owner', 'admin']] },
    ])
    expect(APPROVAL_ACTIONS['access.member.make_owner'].defaults).toEqual([
      { minAmount: null, steps: [['owner']] },
    ])
  })

  it('lets an owner invitation follow the make-owner rules, so inviting cannot bypass them', () => {
    expect(ruleActionKey('access.invitation.owner')).toBe('access.member.make_owner')
    expect(ruleActionKey('access.role.update')).toBe('access.role.update')
    expect(RULE_ACTION_KEYS).toEqual([
      'access.role.update',
      'access.member.make_owner',
      'land.encumbrance.clear',
    ])
  })

  it('lets a role change go ahead when nobody else can approve (spec question 4)', () => {
    expect(APPROVAL_ACTIONS['access.role.update'].whenNoApprover).toBe('proceed')
  })

  it('lets a new owner through without an approver only for a sole owner (security M1)', () => {
    expect(APPROVAL_ACTIONS['access.member.make_owner'].whenNoApprover).toBe('sole_owner')
    expect(APPROVAL_ACTIONS['access.invitation.owner'].whenNoApprover).toBe('sole_owner')
  })

  it('names the effect on the approve button', () => {
    const input = { title: 'Owner', recordLabel: 'Aisha Bello', amountText: null }
    expect(APPROVAL_ACTIONS['access.role.update'].approveLabel(input)).toBe('Approve role change')
    expect(APPROVAL_ACTIONS['access.member.make_owner'].approveLabel(input)).toBe(
      'Make Aisha Bello an owner',
    )
  })

  it('recognises its own keys only', () => {
    expect(isApprovalActionKey('access.role.update')).toBe(true)
    expect(isApprovalActionKey('finance.receipt.reverse')).toBe(false)
  })
})
