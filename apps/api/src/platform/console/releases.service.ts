import {
  addOnOf,
  FEATURE_KEYS,
  type FeatureKey,
  featureLabel,
  isCoreFeature,
  prerequisitesOf,
  RELEASE_GROUPS,
} from '@vento/shared'
import type { ReleaseDetail, ReleaseRow, ReleasesFilter } from '@vento/shared/console'
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  featureReleases,
  organizationOverrides,
  organizations,
  platformAuditEvents,
  users,
} from '@/db/schema'
import { type Snapshot, stageOf } from '../availability'
import { allOrganizationPlans, holders, inAnyPlan, unknownKeysInData } from '../operations/release'
import { loadSnapshot } from '../snapshot'
import { ACTIVITY_COLUMNS, toActivityRow } from './activity.service'

// The Releases pages: every catalog feature, its stage and who has it (admin-console plan §9.6).
// The catalog is bounded (about 45 rows), so the list isn't paginated.

const HOLDER_NAMES_SHOWN = 50

function facts(snapshot: Snapshot, key: FeatureKey) {
  return {
    key,
    label: featureLabel(key),
    module: key.split('.')[0] ?? key,
    stage: stageOf(snapshot, key),
    plans: snapshot.latestPlans.filter((p) => p.features.has(key)).map((p) => p.planName),
    core: isCoreFeature(key),
    addOn: addOnOf(key) ?? null,
  }
}

function matches(filter: ReleasesFilter, snapshot: Snapshot, key: FeatureKey): boolean {
  if (filter === 'all') return true
  if (filter === 'in_no_plan') return !inAnyPlan(snapshot, key)
  return stageOf(snapshot, key) === filter
}

export async function list(
  db: DbOrTx,
  input: { filter: ReleasesFilter },
  now = new Date(),
): Promise<{ items: ReleaseRow[]; staleKeys: string[] }> {
  const [snapshot, orgs, staleKeys] = await runQueries(db, [
    () => loadSnapshot(db, { now }),
    () => allOrganizationPlans(db),
    () => unknownKeysInData(db),
  ])
  const items = FEATURE_KEYS.filter((key) => matches(input.filter, snapshot, key)).map((key) => ({
    ...facts(snapshot, key),
    organizations: holders(snapshot, orgs, key, now).length,
  }))
  return { items, staleKeys }
}

export async function get(db: DbOrTx, key: FeatureKey, now = new Date()): Promise<ReleaseDetail> {
  const [snapshot, orgs, stageRows, overrideRows, recent] = await runQueries(db, [
    () => loadSnapshot(db, { now }),
    () => allOrganizationPlans(db),
    () =>
      db
        .select({
          at: featureReleases.updatedAt,
          byName: users.name,
          reason: featureReleases.reason,
        })
        .from(featureReleases)
        .leftJoin(users, eq(users.id, featureReleases.changedByUserId))
        .where(eq(featureReleases.featureKey, key)),
    () =>
      db
        .select({
          id: organizationOverrides.id,
          kind: organizationOverrides.kind,
          enabled: organizationOverrides.enabled,
          expiresAt: organizationOverrides.expiresAt,
          reason: organizationOverrides.reason,
          trialId: organizationOverrides.trialId,
          at: organizationOverrides.createdAt,
          byName: users.name,
          organizationId: organizations.id,
          organizationName: organizations.name,
        })
        .from(organizationOverrides)
        .innerJoin(organizations, eq(organizations.id, organizationOverrides.organizationId))
        .leftJoin(users, eq(users.id, organizationOverrides.createdByUserId))
        .where(
          and(
            eq(organizationOverrides.key, key),
            inArray(organizationOverrides.kind, ['release', 'feature']),
            isNull(organizationOverrides.clearedAt),
            or(isNull(organizationOverrides.expiresAt), gt(organizationOverrides.expiresAt, now)),
          ),
        )
        .orderBy(organizations.name),
    () =>
      db
        .select(ACTIVITY_COLUMNS)
        .from(platformAuditEvents)
        .leftJoin(organizations, eq(organizations.id, platformAuditEvents.organizationId))
        .where(
          and(
            eq(platformAuditEvents.targetType, 'feature'),
            eq(platformAuditEvents.targetKey, key),
          ),
        )
        .orderBy(desc(platformAuditEvents.createdAt), desc(platformAuditEvents.id))
        .limit(10),
  ])
  const having = holders(snapshot, orgs, key, now)
  const stage = stageRows[0]
  return {
    ...facts(snapshot, key),
    stageChange: stage
      ? { at: stage.at.toISOString(), byName: stage.byName, reason: stage.reason }
      : null,
    needs: [...prerequisitesOf(key)],
    holders: [...RELEASE_GROUPS].reverse().map((group) => {
      const inGroup = having
        .filter((o) => o.releaseGroup === group)
        .sort((a, b) => a.name.localeCompare(b.name))
      return {
        group,
        count: inGroup.length,
        organizations: inGroup
          .slice(0, HOLDER_NAMES_SHOWN)
          .map((o) => ({ id: o.id, name: o.name })),
      }
    }),
    overrides: overrideRows.map((o) => ({
      kind: o.kind as 'release' | 'feature',
      key,
      enabled: o.enabled === true,
      id: o.id,
      until: o.expiresAt ? o.expiresAt.toISOString() : null,
      reason: o.reason,
      byName: o.byName,
      at: o.at.toISOString(),
      fromTrial: o.trialId !== null,
      organization: { id: o.organizationId, name: o.organizationName },
    })),
    recentChanges: recent.map(toActivityRow),
  }
}
