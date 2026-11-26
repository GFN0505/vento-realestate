import { describe, expect, it } from 'vitest'
import { describePlatformEvent } from './describe'

const base = { targetType: 'organization', organizationName: 'Lekki Partners Ltd' }

describe('describePlatformEvent', () => {
  it('puts a stage change in words', () => {
    expect(
      describePlatformEvent({
        ...base,
        action: 'release.stage_changed',
        targetType: 'feature',
        targetKey: 'sales',
        before: { stage: 'internal' },
        after: { stage: 'pilot' },
        organizationName: null,
      }),
    ).toEqual({ summary: 'Moved Sales to pilot', change: 'internal → pilot' })
  })

  it('names the plan an organization moved to', () => {
    expect(
      describePlatformEvent({
        ...base,
        action: 'plan.assigned',
        targetKey: 'x',
        before: { plan: 'Starter v1' },
        after: { plan: 'Growth v2' },
      }),
    ).toEqual({
      summary: 'Moved Lekki Partners Ltd to Growth v2',
      change: 'Starter v1 → Growth v2',
    })
  })

  it('shows a count limit as a whole number and the AI budget in naira', () => {
    expect(
      describePlatformEvent({
        ...base,
        action: 'plan.limit_overridden',
        targetKey: 'projects',
        before: null,
        after: { limit: '8.00' },
      }).summary,
    ).toBe("Set Lekki Partners Ltd's active projects limit to 8")
    expect(
      describePlatformEvent({
        ...base,
        action: 'plan.add_on_changed',
        targetKey: 'x',
        before: { limitIncreases: { ai_budget: '150000.00' } },
        after: { limitIncreases: { ai_budget: '250000.00' } },
      }).change,
    ).toBe('₦150,000 a month → ₦250,000 a month')
  })

  it('keeps an unknown key as it is', () => {
    expect(
      describePlatformEvent({
        ...base,
        action: 'release.stage_changed',
        targetType: 'feature',
        targetKey: 'old.flag',
        before: null,
        after: { stage: 'on' },
        organizationName: null,
      }).summary,
    ).toBe('Moved old.flag to on')
  })
})
