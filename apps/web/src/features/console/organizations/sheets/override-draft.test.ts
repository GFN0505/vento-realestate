import { describe, expect, it } from 'vitest'
import { initialDraft, type OverrideDraft, overrideConfirmLabel, readDraft } from './override-draft'

const blank: OverrideDraft = initialDraft({})
const read = (patch: Partial<OverrideDraft>) => readDraft({ ...blank, ...patch }, 'org')

describe('the Add override form', () => {
  it('starts from a Features row', () => {
    expect(initialDraft({ kind: 'feature', key: 'sales.commissions' })).toMatchObject({
      kind: 'plan',
      target: 'sales.commissions',
    })
    expect(initialDraft({ kind: 'release', key: 'sales' })).toMatchObject({ kind: 'release' })
  })

  it('turns a feature on through a release or the plan', () => {
    expect(read({ kind: 'release', target: 'sales' }).input).toEqual({
      organizationId: 'org',
      kind: 'release',
      key: 'sales',
      value: 'on',
    })
    expect(read({ kind: 'plan', target: 'sales', on: false }).input).toMatchObject({
      kind: 'feature',
      value: 'off',
    })
  })

  it('sets a count limit, or unlimited', () => {
    const limit = read({ kind: 'plan', target: 'limit:entities', amount: '8' }).input
    expect(limit).toMatchObject({ kind: 'limit', key: 'entities', value: 8 })
    expect(limit && overrideConfirmLabel(limit)).toBe('Set companies limit to 8')
    expect(read({ kind: 'plan', target: 'limit:members', unlimited: true }).input).toMatchObject({
      value: 'unlimited',
    })
  })

  it('says what each field needs', () => {
    expect(read({}).errors).toEqual({ target: 'Choose a feature or limit.' })
    expect(read({ kind: 'plan', target: 'limit:entities', amount: '2.5' }).errors).toEqual({
      value: 'Enter a whole number, or choose Unlimited.',
    })
    expect(read({ target: 'sales', until: '2020-01-01' }).errors).toEqual({
      until: 'Choose today or a later date.',
    })
  })

  it('sends the AI budget in naira as a decimal string', () => {
    const input = read({ kind: 'plan', target: 'limit:ai_budget', amount: '₦200,000' }).input
    expect(input).toMatchObject({ key: 'ai_budget', value: '200000.00' })
    expect(input && overrideConfirmLabel(input)).toBe('Set AI budget to ₦200,000')
  })
})
