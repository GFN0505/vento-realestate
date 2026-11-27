import { describe, expect, it } from 'vitest'
import { approvalRuleInput, decideInput, requestOutcome, updateApprovalRuleInput } from './schema'

const ROLE_A = '01900000-0000-7000-8000-00000000000a'
const ROLE_B = '01900000-0000-7000-8000-00000000000b'
const REQUEST = '01900000-0000-7000-8000-0000000000c1'

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? []

const valid = {
  actionKey: 'access.role.update',
  when: { kind: 'any' },
  steps: [[ROLE_A, ROLE_B]],
  entityIds: 'all',
} as const

describe('approvalRuleInput', () => {
  it('accepts a one-step any-amount rule for all companies', () => {
    expect(approvalRuleInput.safeParse(valid).success).toBe(true)
  })

  it('allows the same role in two steps: two different people approve', () => {
    expect(approvalRuleInput.safeParse({ ...valid, steps: [[ROLE_A], [ROLE_A]] }).success).toBe(
      true,
    )
  })

  it('refuses no steps, more than three, an empty step and a repeated role in a step', () => {
    expect(messages(approvalRuleInput.safeParse({ ...valid, steps: [] }))).toContain(
      'Add at least one approver',
    )
    expect(
      messages(
        approvalRuleInput.safeParse({ ...valid, steps: [[ROLE_A], [ROLE_A], [ROLE_A], [ROLE_A]] }),
      ),
    ).toContain('Add up to 3 steps')
    expect(messages(approvalRuleInput.safeParse({ ...valid, steps: [[]] }))).toContain(
      'Choose at least one role for each step',
    )
    expect(
      messages(approvalRuleInput.safeParse({ ...valid, steps: [[ROLE_A, ROLE_A]] })),
    ).toContain('Choose each role once')
  })

  it('refuses a threshold on an action without an amount', () => {
    const r = approvalRuleInput.safeParse({ ...valid, when: { kind: 'over', amount: '5000000' } })
    expect(messages(r)).toContain("Change a role's permissions has no amount. Choose Any amount.")
  })

  it('refuses a rule for an action that follows another action’s rules', () => {
    const r = approvalRuleInput.safeParse({ ...valid, actionKey: 'access.invitation.owner' })
    expect(messages(r)).toContain(
      'Invite someone as an owner follows the rules for Make someone an owner',
    )
  })

  it('refuses an empty company list', () => {
    expect(messages(approvalRuleInput.safeParse({ ...valid, entityIds: [] }))).toContain(
      'Choose at least one company',
    )
  })

  it('needs the loaded version to update', () => {
    expect(updateApprovalRuleInput.safeParse({ ...valid, id: ROLE_A }).success).toBe(false)
    expect(updateApprovalRuleInput.safeParse({ ...valid, id: ROLE_A, version: 2 }).success).toBe(
      true,
    )
  })
})

describe('decideInput', () => {
  it('approves without a comment', () => {
    expect(decideInput.safeParse({ requestId: REQUEST, decision: 'approve' }).success).toBe(true)
  })

  it('needs a comment to reject, and blank does not count', () => {
    expect(messages(decideInput.safeParse({ requestId: REQUEST, decision: 'reject' }))).toEqual([
      'Enter a comment to reject.',
    ])
    expect(
      messages(decideInput.safeParse({ requestId: REQUEST, decision: 'reject', comment: '   ' })),
    ).toEqual(['Enter a comment to reject.'])
  })

  it('caps the comment at 500 characters', () => {
    const r = decideInput.safeParse({
      requestId: REQUEST,
      decision: 'approve',
      comment: 'x'.repeat(501),
    })
    expect(r.success).toBe(false)
  })
})

describe('requestOutcome', () => {
  it('carries the request id only when the action is waiting', () => {
    expect(requestOutcome.safeParse({ ran: true, notice: 'Saved' }).success).toBe(true)
    expect(requestOutcome.safeParse({ ran: false, notice: 'Sent' }).success).toBe(false)
    expect(
      requestOutcome.safeParse({ ran: false, requestId: REQUEST, notice: 'Sent' }).success,
    ).toBe(true)
  })
})
