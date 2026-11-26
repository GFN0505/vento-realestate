import { describe, expect, it } from 'vitest'
import { testPlan } from '@/test/me'
import { peopleLimit, planPlacesMessage, usageLine } from './plan-places'

const starter = (used: number) =>
  peopleLimit(testPlan({ limits: [{ key: 'members', included: 10, used }] }))

describe('plan places', () => {
  it('reads the people limit from the owner plan block', () => {
    expect(starter(8)).toEqual({ included: 10, used: 8, planName: 'Starter' })
    expect(usageLine(starter(8) ?? fail())).toBe('8 of 10 people on your Starter plan')
  })

  it('has no limit when the plan is unlimited, internal or not shown', () => {
    expect(
      peopleLimit(testPlan({ limits: [{ key: 'members', included: null, used: 3 }] })),
    ).toBeNull()
    expect(peopleLimit(testPlan({ limits: [] }))).toBeNull()
    expect(peopleLimit(null)).toBeNull()
  })

  it('says nothing while the rows fit exactly', () => {
    expect(planPlacesMessage(starter(8), 2)).toBeNull()
  })

  it('leads with the places left and the way to get more', () => {
    expect(planPlacesMessage(starter(8), 3)).toBe(
      'You have 2 places left on your Starter plan. Talk to Vento for more.',
    )
  })

  it('says every place is taken at the limit', () => {
    expect(planPlacesMessage(starter(10), 1)).toMatch(
      /^All 10 places on your Starter plan are taken/,
    )
  })
})

function fail(): never {
  throw new Error('expected a limit')
}
