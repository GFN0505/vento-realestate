import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS } from './actions'
import {
  AUDIT_ACTION_META,
  AUDIT_MODULES,
  auditActionsInModule,
  auditActionsMatching,
  auditFieldChanges,
  auditModuleOf,
  auditWhat,
  OTHER_DETAILS_CHANGED,
} from './labels'

const blank = { targetLabel: null, metadata: null }

describe('audit action labels', () => {
  it.each(AUDIT_ACTIONS.map((a) => [a]))('gives %s a module and plain words', (action) => {
    const meta = AUDIT_ACTION_META[action]
    expect(meta, action).toBeDefined()
    expect(AUDIT_MODULES).toContain(meta.module)
    expect(meta.name).toMatch(/^[A-Z]/)
    expect(auditWhat(action, blank)).toMatch(/^[A-Z]/)
    // No codes: the words never echo the action key or its dotted parts.
    expect(auditWhat(action, blank)).not.toContain('.')
    expect(auditWhat(action, blank)).not.toContain('_')
  })

  it('has no label for an action that does not exist', () => {
    expect(Object.keys(AUDIT_ACTION_META).sort()).toEqual([...AUDIT_ACTIONS].sort())
  })

  it('names the record and says "company" for entity events (decision 0018)', () => {
    expect(auditWhat('role.updated', { targetLabel: 'Finance manager', metadata: null })).toBe(
      'Changed role Finance manager',
    )
    expect(auditWhat('entity.archived', { targetLabel: 'Parkview SPV', metadata: null })).toBe(
      'Archived company Parkview SPV',
    )
    expect(auditWhat('member.access_changed', { targetLabel: 'Aisha Bello', metadata: null })).toBe(
      "Changed Aisha Bello's role or companies",
    )
  })

  it("reads Vento Real Estate's own sentence for plan and console changes", () => {
    const e = {
      targetLabel: 'Vento Homes Ltd',
      metadata: { message: 'Vento changed your AI budget to ₦250,000 a month' },
    }
    expect(auditWhat('plan.add_on_changed', e)).toBe(
      'Vento changed your AI budget to ₦250,000 a month',
    )
    expect(auditWhat('plan.add_on_changed', blank)).toBe('Changed an add-on')
    expect(auditModuleOf('console.opened')).toBe('account')
  })

  it('counts an export and a step from the metadata', () => {
    expect(auditWhat('audit.exported', { targetLabel: null, metadata: { count: 1284 } })).toBe(
      'Exported the audit log · 1,284 entries',
    )
    expect(
      auditWhat('approval.step_approved', {
        targetLabel: 'Site engineer',
        metadata: { position: 1 },
      }),
    ).toBe('Approved step 1: Site engineer')
  })

  it('reads an action it does not know as words, never its code', () => {
    expect(auditWhat('payroll.run_posted', blank)).toBe('Made a change')
    expect(auditModuleOf('payroll.run_posted')).toBeNull()
  })

  it('files account events under Sign-in & security and access events under Settings', () => {
    expect(auditActionsInModule('account')).toContain('auth.signed_in')
    expect(auditActionsInModule('settings')).toContain('role.updated')
    expect(auditActionsInModule('settings')).not.toContain('auth.signed_in')
  })

  it('finds actions by their words', () => {
    expect(auditActionsMatching('role')).toEqual(
      expect.arrayContaining([
        'role.created',
        'role.updated',
        'role.deleted',
        'member.access_changed',
      ]),
    )
    expect(auditActionsMatching('  ')).toEqual([])
  })
})

describe('auditFieldChanges', () => {
  it('labels known fields and words their values', () => {
    expect(
      auditFieldChanges(
        { role: 'Sales', entities: ['Parkview SPV'], requiresTwoStep: false },
        { role: 'Finance', entities: 'all', requiresTwoStep: true },
      ),
    ).toEqual([
      { label: 'Role', before: 'Sales', after: 'Finance' },
      { label: 'Companies', before: 'Parkview SPV', after: 'All companies' },
      { label: 'Two-step required', before: 'No', after: 'Yes' },
    ])
  })

  it('expands permissions to one row per module', () => {
    expect(
      auditFieldChanges(
        { permissions: { finance: ['view'] } },
        { permissions: { finance: ['view', 'approve'] } },
      ),
    ).toEqual([{ label: 'Finance', before: 'View', after: 'View, Approve' }])
    expect(
      auditFieldChanges({ permissions: { land: ['view'] } }, { permissions: { land: [] } }),
    ).toEqual([{ label: 'Land & title', before: 'View', after: 'No access' }])
  })

  it('shows "Other details changed" once for unknown keys or values, never JSON', () => {
    const rows = auditFieldChanges(
      { name: 'Old', secretSauce: 1, nested: { a: 1 } },
      { name: 'New', secretSauce: 2, nested: { a: 2 } },
    )
    expect(rows).toEqual([
      { label: 'Name', before: 'Old', after: 'New' },
      { label: OTHER_DETAILS_CHANGED, before: null, after: null },
    ])
    expect(JSON.stringify(rows)).not.toContain('{"a"')
  })

  it('reads a month number and a missing side', () => {
    expect(auditFieldChanges(null, { financialYearStartMonth: 4, status: 'archived' })).toEqual([
      { label: 'Financial year starts', before: null, after: 'April' },
      { label: 'Status', before: null, after: 'Archived' },
    ])
  })
})
