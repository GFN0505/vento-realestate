import { describe, expect, it } from 'vitest'
import { me } from '../account/schema'
import { errorMap } from '../common/errors'
import { consoleContract } from './contract'
import {
  addAi,
  attentionItem,
  confirmInput,
  dashboard,
  feedRow,
  inviteSuperAdmin,
  limitValue,
  listActivityInput,
  reason,
  setOverride,
  staffJoinGetInput,
  staffJoinPreview,
  staffJoinStartInput,
  startTrial,
  trialDays,
  withdrawStaffInvitation,
} from './schema'

const orgId = '0193f2a0-0000-7000-8000-000000000001'
const key = '6f1f0c52-4c8e-4c1a-9a51-0f0e7b0b8f0a'

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message
}

describe('reason', () => {
  it('trims and keeps a reason of 3 characters or more', () => {
    expect(reason.parse('  Release 1 pilot ')).toBe('Release 1 pilot')
  })

  it('asks for a reason when it is shorter than 3 characters after trimming', () => {
    expect(firstMessage(reason.safeParse('  ok  '))).toBe('Add a reason so the activity says why.')
  })

  it('refuses a reason over 500 characters', () => {
    expect(reason.safeParse('a'.repeat(501)).success).toBe(false)
  })
})

describe('AI budget', () => {
  it('normalises the budget to a decimal string', () => {
    const input = addAi.previewInput.parse({ organizationId: orgId, budget: '150000' })
    expect(input.budget).toBe('150000.00')
  })

  it('refuses a budget of zero', () => {
    const result = addAi.previewInput.safeParse({ organizationId: orgId, budget: '0' })
    expect(firstMessage(result)).toBe('Enter a monthly budget above ₦0')
  })
})

describe('trial days', () => {
  it.each([1, 30, 90])('accepts %i days', (days) => {
    expect(trialDays.safeParse(days).success).toBe(true)
  })

  it.each([0, 91, 2.5])('refuses %s days with one message', (days) => {
    expect(firstMessage(trialDays.safeParse(days))).toBe('A trial lasts 1 to 90 days.')
  })
})

describe('limit value', () => {
  it('accepts a whole number or unlimited', () => {
    expect(limitValue.parse(8)).toBe(8)
    expect(limitValue.parse('unlimited')).toBe('unlimited')
  })

  it('refuses a negative or fractional limit', () => {
    expect(limitValue.safeParse(-1).success).toBe(false)
    expect(limitValue.safeParse(1.5).success).toBe(false)
  })
})

describe('setOverride', () => {
  const base = { organizationId: orgId, until: '2027-01-31' }

  it('takes on or off for a feature and a number for a count limit', () => {
    expect(
      setOverride.previewInput.safeParse({
        ...base,
        kind: 'release',
        key: 'sales.commissions',
        value: 'on',
      }).success,
    ).toBe(true)
    expect(
      setOverride.previewInput.safeParse({ ...base, kind: 'limit', key: 'projects', value: 8 })
        .success,
    ).toBe(true)
  })

  it('takes naira for the AI budget limit', () => {
    const input = setOverride.previewInput.parse({
      ...base,
      kind: 'limit',
      key: 'ai_budget',
      value: '250000',
    })
    expect(input.value).toBe('250000.00')
  })

  it('refuses on/off for a limit and a number for a feature', () => {
    expect(
      setOverride.previewInput.safeParse({ ...base, kind: 'limit', key: 'projects', value: 'on' })
        .success,
    ).toBe(false)
    expect(
      setOverride.previewInput.safeParse({ ...base, kind: 'feature', key: 'sales', value: 8 })
        .success,
    ).toBe(false)
  })

  it('refuses an until that is not a date', () => {
    expect(
      setOverride.previewInput.safeParse({
        ...base,
        until: '31/01/2027',
        kind: 'feature',
        key: 'sales',
        value: 'on',
      }).success,
    ).toBe(false)
  })
})

describe('apply inputs', () => {
  const fields = { organizationId: orgId, planKey: 'enterprise', days: 30 }

  it('need the previewed state, a reason and an idempotency key', () => {
    expect(
      startTrial.applyInput.safeParse({
        ...fields,
        expected: { trialId: null },
        reason: 'Deal with Lekki',
        idempotencyKey: key,
      }).success,
    ).toBe(true)
    expect(startTrial.applyInput.safeParse({ ...fields, reason: 'Deal with Lekki' }).success).toBe(
      false,
    )
  })

  it('refuse fields they do not know', () => {
    expect(
      startTrial.previewInput.safeParse({ ...fields, organizationName: 'Lekki' }).success,
    ).toBe(false)
  })
})

describe('confirm input', () => {
  it('takes a 6-digit code, a backup code or a passkey response', () => {
    expect(confirmInput.safeParse({ method: 'code', code: '123456' }).success).toBe(true)
    expect(confirmInput.safeParse({ method: 'backup_code', code: 'abcde-fghij' }).success).toBe(
      true,
    )
    expect(confirmInput.safeParse({ method: 'passkey', response: { id: 'x' } }).success).toBe(true)
  })

  it('never takes a password', () => {
    expect(confirmInput.safeParse({ method: 'password', password: 'secret' }).success).toBe(false)
  })

  it('refuses a code that is not 6 digits', () => {
    expect(confirmInput.safeParse({ method: 'code', code: '12345' }).success).toBe(false)
  })

  it('refuses a passkey response over 8 KB', () => {
    const response = { id: 'x', blob: 'a'.repeat(8 * 1024) }
    expect(confirmInput.safeParse({ method: 'passkey', response }).success).toBe(false)
  })
})

describe('activity filters', () => {
  it('refuses an end date before the start date', () => {
    const result = listActivityInput.safeParse({ from: '2026-11-26', to: '2026-11-01' })
    expect(firstMessage(result)).toBe('Choose an end date on or after the start date.')
  })
})

describe('staff invitation inputs', () => {
  it('lower-cases and trims the email and trims the name', () => {
    const input = inviteSuperAdmin.previewInput.parse({
      email: '  Tunde@VentoERP.com ',
      name: ' Tunde Bello ',
    })
    expect(input).toEqual({ email: 'tunde@ventoerp.com', name: 'Tunde Bello' })
  })

  it('refuses an email that is not an address and a one-letter name', () => {
    const badEmail = inviteSuperAdmin.previewInput.safeParse({ email: 'tunde', name: 'Tunde' })
    expect(firstMessage(badEmail)).toBe('Enter a valid email address, like aisha@ventohomes.ng')
    const badName = inviteSuperAdmin.previewInput.safeParse({ email: 'a@b.ng', name: 'T' })
    expect(firstMessage(badName)).toBe('Enter your name')
  })

  it('needs a reason and a key to send it', () => {
    const fields = { email: 'tunde@ventoerp.com', name: 'Tunde Bello', expected: {} }
    expect(
      inviteSuperAdmin.applyInput.safeParse({
        ...fields,
        reason: 'Joins the release rota',
        idempotencyKey: key,
      }).success,
    ).toBe(true)
    expect(inviteSuperAdmin.applyInput.safeParse(fields).success).toBe(false)
  })

  it('withdraws only an invitation still pending when the confirm opened', () => {
    const fields = { invitationId: orgId, reason: 'Wrong email', idempotencyKey: key }
    const pending = { ...fields, expected: { status: 'pending' } }
    const accepted = { ...fields, expected: { status: 'accepted' } }
    expect(withdrawStaffInvitation.applyInput.safeParse(pending).success).toBe(true)
    expect(withdrawStaffInvitation.applyInput.safeParse(accepted).success).toBe(false)
  })
})

describe('staff sign-up inputs', () => {
  it('bounds the token length', () => {
    expect(staffJoinGetInput.safeParse({ token: 'a'.repeat(43) }).success).toBe(true)
    expect(staffJoinGetInput.safeParse({ token: '' }).success).toBe(false)
    expect(staffJoinGetInput.safeParse({ token: 'a'.repeat(201) }).success).toBe(false)
  })

  it('takes a password, and a name only when there is one', () => {
    const token = 'a'.repeat(43)
    expect(staffJoinStartInput.safeParse({ token, password: 'x' }).success).toBe(true)
    expect(
      staffJoinStartInput.safeParse({ token, name: 'Tunde Bello', password: 'x' }).success,
    ).toBe(true)
    expect(firstMessage(staffJoinStartInput.safeParse({ token, password: '' }))).toBe(
      'Enter your password',
    )
    expect(staffJoinStartInput.safeParse({ token, password: 'a'.repeat(129) }).success).toBe(false)
  })

  it('answers an unknown link as expired with nothing else', () => {
    const unknown = {
      status: 'expired',
      email: null,
      name: null,
      inviterName: null,
      expiresAt: null,
      resume: false,
    }
    expect(staffJoinPreview.safeParse(unknown).success).toBe(true)
  })
})

describe('dashboard', () => {
  const organization = { id: orgId, name: 'Parkview Homes' }

  it('describes each Needs attention row by its kind', () => {
    const over = { kind: 'over_limit', organization, limit: 'members', used: 17, included: 15 }
    expect(attentionItem.safeParse(over).success).toBe(true)
    expect(attentionItem.safeParse({ kind: 'quiet', organization, days: 18 }).success).toBe(true)
    expect(attentionItem.safeParse({ kind: 'no_plan', organization }).success).toBe(true)
    expect(attentionItem.safeParse({ kind: 'quiet', organization }).success).toBe(false)
  })

  it('keeps feed rows to organization, kind, count and time', () => {
    const row = {
      organization,
      kind: 'people_joined',
      day: '2026-11-27',
      count: 3,
      latestAt: '2026-11-27T10:00:00.000Z',
    }
    expect(feedRow.parse({ ...row, actorName: 'Olumide Bankole', ip: '102.89.34.1' })).toEqual(row)
  })

  it('caps the queue at 8 rows', () => {
    const items = Array.from({ length: 9 }, () => ({ kind: 'no_plan', organization }))
    const result = dashboard.shape.attention.safeParse({ items, more: 0 })
    expect(result.success).toBe(false)
  })
})

describe('console contract', () => {
  type Node = { '~orpc'?: { meta: { feature?: unknown; area?: unknown } } }
  function procedures(node: unknown): Node[] {
    if (node && typeof node === 'object' && '~orpc' in node) return [node as Node]
    return Object.values(node as Record<string, unknown>).flatMap(procedures)
  }

  it('marks every procedure as a console procedure with no feature flag', () => {
    const all = procedures(consoleContract)
    expect(all.length).toBeGreaterThan(30)
    for (const p of all) expect(p['~orpc']?.meta).toEqual({ feature: null, area: 'console' })
  })
})

describe('shared errors for the console', () => {
  it('lets NOT_FOUND carry a console reason and nothing else', () => {
    const data = errorMap.NOT_FOUND.data
    expect(data.safeParse(undefined).success).toBe(true)
    expect(data.safeParse({ reason: 'console_window_closed' }).success).toBe(true)
    expect(data.safeParse({ reason: 'permission' }).success).toBe(false)
  })

  it('lets a refused invite offer Resend on the open invitation', () => {
    const data = { reason: 'platform_refused', next: 'resend_invitation', invitationId: orgId }
    expect(errorMap.CONFLICT.data.safeParse(data).success).toBe(true)
  })

  it('lists the staff emails a customer invite refused', () => {
    const data = { reason: 'staff_account', staffAccounts: ['tunde@ventoerp.com'] }
    expect(errorMap.CONFLICT.data.safeParse(data).success).toBe(true)
    expect(errorMap.FORBIDDEN.data.safeParse({ reason: 'staff_account' }).success).toBe(true)
  })
})

describe('me', () => {
  it('requires the console field, null for everyone but super-admins', () => {
    expect(me.shape.console.safeParse(null).success).toBe(true)
    expect(me.shape.console.safeParse({ twoStepOn: true }).success).toBe(true)
    expect(me.shape.console.safeParse(undefined).success).toBe(false)
  })
})
