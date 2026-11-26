import { describe, expect, it } from 'vitest'
import { errorMap } from '../common/errors'
import { planDefinition, planLimits } from './schema'

const starter = {
  key: 'starter',
  name: 'Starter',
  sortOrder: 1,
  features: ['land', 'projects', 'sales'],
  limits: { projects: 1, entities: 2, members: 10, ai_budget: '0' },
}

describe('planDefinition', () => {
  it('accepts a plan file and normalises the AI budget to money', () => {
    const plan = planDefinition.parse(starter)
    expect(plan.limits.ai_budget).toBe('0.00')
    expect(plan.features).toEqual(['land', 'projects', 'sales'])
  })

  it('refuses an unknown feature key', () => {
    expect(planDefinition.safeParse({ ...starter, features: ['sales.comissions'] }).success).toBe(
      false,
    )
  })

  it('refuses core and add-on features, which are never listed in plans', () => {
    const core = planDefinition.safeParse({ ...starter, features: ['compliance'] })
    const addOn = planDefinition.safeParse({ ...starter, features: ['ai.ask'] })
    expect(core.success).toBe(false)
    expect(addOn.success).toBe(false)
    expect(core.error?.issues[0]?.message).toBe('Core and add-on features are not listed in plans')
  })

  it('refuses a feature listed twice', () => {
    expect(planDefinition.safeParse({ ...starter, features: ['land', 'land'] }).success).toBe(false)
  })
})

describe('planLimits', () => {
  it('treats a missing limit as unlimited by leaving it out', () => {
    expect(planLimits.parse({})).toEqual({})
  })

  it('refuses unknown limits and negative counts', () => {
    expect(planLimits.safeParse({ units: 10 }).success).toBe(false)
    expect(planLimits.safeParse({ projects: -1 }).success).toBe(false)
    expect(planLimits.safeParse({ projects: 1.5 }).success).toBe(false)
  })
})

describe('plan_limit error data', () => {
  it('carries the limit and what the plan includes', () => {
    const data = errorMap.FORBIDDEN.data.parse({
      reason: 'plan_limit',
      limit: 'entities',
      included: 2,
      askName: 'Olumide Bankole',
      askRole: 'owner',
    })
    expect(data).toMatchObject({ reason: 'plan_limit', limit: 'entities', included: 2 })
  })
})
