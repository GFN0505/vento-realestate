import { describe, expect, it } from 'vitest'
import { limitState, limitText, listWords, naira, planLabel, trialLeft } from './words'

const now = new Date('2026-11-26T10:00:00+01:00')

describe('console words', () => {
  it('names the plan, whatever the release group, or no plan', () => {
    expect(planLabel({ name: 'Growth', version: 2 })).toBe('Growth v2')
    expect(planLabel(null)).toBe('No plan')
  })

  it('counts trial days left from its last day in Lagos', () => {
    expect(trialLeft('2026-12-05', now)).toBe('9 days left')
    expect(trialLeft('2026-11-27', now)).toBe('1 day left')
    expect(trialLeft('2026-11-26', now)).toBe('ends today')
  })

  it('says when a limit is reached or passed', () => {
    expect(limitText({ key: 'members', included: 15, used: 11 })).toBe('11 of 15')
    expect(limitState({ key: 'members', included: 15, used: 15 })).toBe('at')
    expect(limitText({ key: 'entities', included: 2, used: 3 })).toBe('3 of 2 · over the limit')
    expect(limitText({ key: 'entities', included: null, used: 4 })).toBe('4')
  })

  it('writes naira and lists in words', () => {
    expect(naira('150000.00')).toBe('₦150,000')
    expect(naira('250000.50')).toBe('₦250,000.50')
    expect(listWords(['Sales', 'Finance'])).toBe('Sales and Finance')
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
