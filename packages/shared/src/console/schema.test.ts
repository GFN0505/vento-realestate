import { describe, expect, it } from 'vitest'
import { me } from '../account/schema'
import { errorMap } from '../common/errors'
import { consoleContract } from './contract'
import {
  addAi,
  confirmInput,
  limitValue,
  listActivityInput,
  reason,
  setOverride,
  startTrial,
  trialDays,
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
})

describe('me', () => {
  it('requires the console field, null for everyone but super-admins', () => {
    expect(me.shape.console.safeParse(null).success).toBe(true)
    expect(me.shape.console.safeParse({ twoStepOn: true }).success).toBe(true)
    expect(me.shape.console.safeParse(undefined).success).toBe(false)
  })
})
