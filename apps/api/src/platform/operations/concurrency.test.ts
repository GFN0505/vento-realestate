import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db as pool } from '@/db/client'
import { featureReleases, plans } from '@/db/schema'
import { uniqueEmail } from '@/test/db'
import { createSuperAdmin, type TestUser } from '@/test/factories'
import type { PlatformActor } from '../platform-audit'
import { publishPlan } from './plans'
import { previewStage, setStage } from './release'
import { revokeSuperAdmin } from './super-admin'

// Two changes at the same moment, on two connections, committed (review R1, R2, R5). Each test
// cleans up what it can; append-only audit rows stay.

const actor = (user: TestUser): PlatformActor => ({
  userId: user.id,
  name: user.name,
  channel: 'console',
  operator: 'console · test',
})

function outcome(results: PromiseSettledResult<unknown>[]) {
  return {
    done: results.filter((r) => r.status === 'fulfilled').length,
    refused: results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : [])),
  }
}

describe('at the same moment', () => {
  it('two super-admins removing each other leaves one of them (R1)', async () => {
    const ada = await createSuperAdmin(pool, { email: uniqueEmail('ada.r1') })
    const tunde = await createSuperAdmin(pool, {
      name: 'Tunde Bello',
      email: uniqueEmail('tunde.r1'),
    })
    const results = await Promise.allSettled([
      revokeSuperAdmin(pool, actor(ada), { userId: tunde.id, reason: 'Race check' }),
      revokeSuperAdmin(pool, actor(tunde), { userId: ada.id, reason: 'Race check' }),
    ])
    const { done, refused } = outcome(results)
    expect(done).toBe(1)
    expect(refused).toEqual([
      expect.objectContaining({ message: "You're no longer a Vento super-admin." }),
    ])
  })

  it('two first-ever stage changes previewed together: the second is stale (R2)', async () => {
    const key = 'realtor_portal'
    const ada = await createSuperAdmin(pool, { email: uniqueEmail('ada.r2') })
    const tunde = await createSuperAdmin(pool, {
      name: 'Tunde Bello',
      email: uniqueEmail('tunde.r2'),
    })
    await pool.delete(featureReleases).where(eq(featureReleases.featureKey, key))
    try {
      const { expected } = await previewStage(pool, key, 'pilot')
      const results = await Promise.allSettled([
        setStage(pool, actor(ada), { key, stage: 'pilot', reason: 'Race check', expected }),
        setStage(pool, actor(tunde), { key, stage: 'on', reason: 'Race check', expected }),
      ])
      const { done, refused } = outcome(results)
      expect(done).toBe(1)
      expect(refused).toEqual([expect.objectContaining({ kind: 'stale' })])
    } finally {
      // Back to "no row" (internal), so no other test sees the moved stage.
      await pool.delete(featureReleases).where(eq(featureReleases.featureKey, key))
    }
  })

  it('two new plans with the same key: the second is refused, not a server error (R5)', async () => {
    const ada = await createSuperAdmin(pool, { email: uniqueEmail('ada.r5') })
    const key = `race_${Date.now().toString(36)}`
    const definition = {
      key,
      name: 'Race plan',
      sortOrder: 77,
      features: [],
      limits: { ai_budget: '0.00' },
    }
    try {
      const results = await Promise.allSettled([
        publishPlan(pool, actor(ada), { definition, reason: 'Race check', isNew: true }),
        publishPlan(pool, actor(ada), { definition, reason: 'Race check', isNew: true }),
      ])
      const { done, refused } = outcome(results)
      expect(done).toBe(1)
      expect(refused).toEqual([
        expect.objectContaining({ message: `There's already a plan called "${key}".` }),
      ])
    } finally {
      // Archived, so no other test's plan lists or hints include it.
      await pool
        .update(plans)
        .set({ archivedAt: new Date(), sortOrder: 99 })
        .where(and(eq(plans.key, key)))
    }
  })
})
