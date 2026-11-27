import { Decimal, isFeatureKey, type PlanLimits } from '@vento/shared'
import type { PlanDetail, PlanRow } from '@vento/shared/console'
import { asc, count, desc, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { organizationPlans, plans, planVersions } from '@/db/schema'
import { notFound } from '@/lib/errors'

// The Plans pages: plans, their versions and how many organizations are on each.

/** Stored limits in the shared shape (older rows may lack the AI budget, which is then 0). */
function storedLimits(raw: unknown): PlanLimits {
  const limits = (raw ?? {}) as Record<string, unknown>
  const count = (key: string) =>
    typeof limits[key] === 'number' ? (limits[key] as number) : undefined
  return {
    ...(count('projects') !== undefined && { projects: count('projects') }),
    ...(count('entities') !== undefined && { entities: count('entities') }),
    ...(count('members') !== undefined && { members: count('members') }),
    ai_budget: new Decimal(String(limits.ai_budget ?? 0)).toFixed(2),
  }
}

async function versionRows(db: DbOrTx) {
  return db
    .select({
      planId: plans.id,
      key: plans.key,
      name: plans.name,
      sortOrder: plans.sortOrder,
      defaultForNew: plans.isDefaultForNew,
      versionId: planVersions.id,
      version: planVersions.version,
      publishedAt: planVersions.createdAt,
      features: planVersions.features,
      limits: planVersions.limits,
      organizations: count(organizationPlans.id),
    })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .leftJoin(organizationPlans, eq(organizationPlans.planVersionId, planVersions.id))
    .where(isNull(plans.archivedAt))
    .groupBy(plans.id, planVersions.id)
    .orderBy(asc(plans.sortOrder), desc(planVersions.version))
}

export async function list(db: DbOrTx): Promise<PlanRow[]> {
  const rows = await versionRows(db)
  const byPlan = new Map<string, PlanRow>()
  for (const r of rows) {
    const plan = byPlan.get(r.planId) ?? {
      key: r.key,
      name: r.name,
      sortOrder: r.sortOrder,
      defaultForNew: r.defaultForNew,
      latestVersion: r.version,
      versions: [],
    }
    plan.versions.push({ version: r.version, organizations: r.organizations })
    byPlan.set(r.planId, plan)
  }
  return [...byPlan.values()]
}

export async function get(db: DbOrTx, key: string): Promise<PlanDetail> {
  const rows = (await versionRows(db)).filter((r) => r.key === key)
  const first = rows[0]
  if (!first) throw notFound()
  return {
    key: first.key,
    name: first.name,
    sortOrder: first.sortOrder,
    defaultForNew: first.defaultForNew,
    versions: rows.map((r) => ({
      id: r.versionId,
      version: r.version,
      publishedAt: r.publishedAt.toISOString(),
      // Keys the code no longer knows are left out, as the snapshot does.
      features: r.features.filter(isFeatureKey),
      limits: storedLimits(r.limits),
      organizations: r.organizations,
    })),
  }
}
