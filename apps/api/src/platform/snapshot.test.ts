import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { plans, planVersions } from '@/db/schema'
import { withRollback } from '@/test/db'
import { loadSnapshot, parseLimits } from './snapshot'

describe('snapshot loading', () => {
  it('skips a malformed add-on increase and reports it, keeping the rest', () => {
    const unknown = new Set<string>()
    expect(
      parseLimits({ projects: 'lots', entities: -2, members: 10, ai_budget: '0' }, unknown),
    ).toEqual({
      members: '10.00',
      ai_budget: '0.00',
    })
    expect([...unknown].sort()).toEqual(['bad-limit:entities', 'bad-limit:projects'])
  })

  it('counts a malformed plan base as 0 (never unlimited) when asked to', () => {
    const unknown = new Set<string>()
    expect(parseLimits({ projects: 'lots', ai_budget: '0' }, unknown, 'zero')).toEqual({
      projects: '0.00',
      ai_budget: '0.00',
    })
    expect([...unknown]).toEqual(['bad-limit:projects'])
  })

  it('still loads when one plan version holds a malformed limit, which counts as 0', () =>
    withRollback(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({ key: 'broken', name: 'Broken', sortOrder: 99 })
        .returning({ id: plans.id })
      await tx.insert(planVersions).values({
        planId: plan?.id ?? '',
        version: 1,
        features: ['land'],
        limits: { projects: 'not a number', ai_budget: '0' },
        reason: 'test',
      })
      const snapshot = await loadSnapshot(tx)
      const broken = snapshot.latestPlans.find((p) => p.planKey === 'broken')
      expect(broken?.limits).toEqual({ projects: '0.00', ai_budget: '0.00' })
      expect((await tx.select().from(plans).where(eq(plans.key, 'starter'))).length).toBe(1)
    }))
})
