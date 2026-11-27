import { describe, expect, it } from 'vitest'
import { planInvite, rowProblem } from './invite-plan'
import { toParsed } from './parse-emails'
import type { InviteRow } from './use-invite-draft'

const row = (email: string, clash: InviteRow['clash'] = null): InviteRow => ({
  ...toParsed(email),
  roleId: null,
  clash,
})
const limit = { included: 3, used: 2, planName: 'Starter' }

describe('planInvite', () => {
  it('counts only rows without a problem, so marked rows never block the rest', () => {
    const plan = planInvite(
      [
        row('a@x.ng'),
        row('kemi@'),
        row('me@x.ng'),
        row('b@x.ng', { kind: 'member' }),
        row('c@x.ng'),
      ],
      'me@x.ng',
      null,
    )
    expect(plan.sendable.map((r) => r.email)).toEqual(['a@x.ng', 'c@x.ng'])
    expect(plan.problems).toBe(3)
  })

  it('names the rows past the places left on the plan', () => {
    const plan = planInvite([row('a@x.ng'), row('b@x.ng'), row('c@x.ng')], 'me@x.ng', limit)
    expect(plan.left).toBe(1)
    expect([...plan.over]).toEqual(['b@x.ng', 'c@x.ng'])
  })
})

describe('a staff email in Invite people', () => {
  it('is a row problem, never sent', () => {
    const staff = row('tunde@ventoerp.com', { kind: 'staff' })
    // Neutral: it never says why (audit L4).
    expect(rowProblem(staff, 'me@x.ng')).toBe("This email can't be invited. Use a different email.")
    expect(planInvite([staff, row('a@x.ng')], 'me@x.ng', null).sendable).toHaveLength(1)
  })
})
