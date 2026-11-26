import { planDefinition } from '@vento/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { organizationPlans, organizations, plans, planVersions } from '@/db/schema'
import { findPlanVersion } from './operations/common'
import { assignPlan, publishPlan } from './operations/plans'
import enterprise from './plans/enterprise.json' with { type: 'json' }
import growth from './plans/growth.json' with { type: 'json' }
import starter from './plans/starter.json' with { type: 'json' }
import type { PlatformActor } from './platform-audit'

/** The starting plans (release plan §5). Production publishes the same files with `pnpm plans publish`. */
export const STARTING_PLANS = [starter, growth, enterprise].map((p) => planDefinition.parse(p))

export const SETUP_ACTOR: PlatformActor = { userId: null, name: 'Vento (setup)', operator: null }

/** Publishes each starting plan that doesn't exist yet. Safe to run again: existing plans are left alone. */
export async function seedPlans(db: DbOrTx, actor: PlatformActor = SETUP_ACTOR): Promise<string[]> {
  const published: string[] = []
  for (const definition of STARTING_PLANS) {
    const [existing] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.key, definition.key))
    if (existing) continue
    await publishPlan(db, actor, { definition, reason: 'Starting plan (release plan §5)' })
    published.push(definition.name)
  }
  return published
}

/**
 * Starting data on an environment: the plans, then every internal organization without a plan
 * goes on Enterprise (internal organizations already have everything; this names their plan).
 * Safe to run again.
 */
export async function bootstrapStartingData(
  db: DbOrTx,
  actor: PlatformActor = SETUP_ACTOR,
): Promise<{ published: string[]; assigned: string[] }> {
  const published = await seedPlans(db, actor)
  const target = await findPlanVersion(db, 'enterprise')
  const orphans = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizationPlans)
    .innerJoin(organizations, eq(organizations.id, organizationPlans.organizationId))
    .where(
      and(eq(organizationPlans.releaseGroup, 'internal'), isNull(organizationPlans.planVersionId)),
    )
  for (const organization of orphans) {
    await assignPlan(db, actor, {
      organization,
      target,
      reason: 'Starting data: internal organizations go on Enterprise',
    })
  }
  return { published, assigned: orphans.map((o) => o.name) }
}

/** The plan a self-signed-up organization starts on (owner's answer: Starter), or none. */
export async function defaultPlanVersionId(db: DbOrTx): Promise<string | null> {
  const [row] = await db
    .select({ id: planVersions.id })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(and(eq(plans.isDefaultForNew, true), isNull(plans.archivedAt)))
    .orderBy(desc(planVersions.version))
    .limit(1)
  return row?.id ?? null
}
