import {
  Decimal,
  type FeatureKey,
  isFeatureKey,
  LIMIT_KEYS,
  type LimitKey,
  type ReleaseStage,
} from '@vento/shared'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  featureReleases,
  organizationAddOns,
  organizationOverrides,
  organizationPlans,
  organizationTrials,
  plans,
  planVersions,
} from '@/db/schema'
import { logger } from '@/lib/logger'
import {
  type AddOnRow,
  type OrganizationAvailability,
  type OrganizationRows,
  type OverrideRow,
  organizationAvailability,
  type PlanVersionInfo,
  type Snapshot,
  type TrialRow,
} from './availability'

function toLimitValue(raw: unknown): string | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  try {
    const value = new Decimal(raw)
    return value.isFinite() && value.gte(0) ? value.toFixed(2) : null
  } catch {
    return null
  }
}

/** Turns stored limits (`{ projects: 1, ai_budget: "0.00" }`) into decimal strings, dropping unknown keys. */
export function parseLimits(
  value: unknown,
  unknown: Set<string>,
  /**
   * `skip` (add-on increases): a bad increase is ignored, so the plan's base applies.
   * `zero` (a plan's base): a bad base counts as 0, so creates are refused, never unlimited.
   */
  onBad: 'skip' | 'zero' = 'skip',
): Partial<Record<LimitKey, string>> {
  const limits: Partial<Record<LimitKey, string>> = {}
  if (!value || typeof value !== 'object') return limits
  for (const [key, raw] of Object.entries(value)) {
    if (!(LIMIT_KEYS as readonly string[]).includes(key)) {
      unknown.add(`limit:${key}`)
      continue
    }
    const parsed = toLimitValue(raw)
    // One malformed value is dropped and reported; it must never stop the whole snapshot loading.
    if (parsed === null) {
      unknown.add(`bad-limit:${key}`)
      // Fail closed: a malformed value must never read as "unlimited".
      if (onBad === 'zero') limits[key as LimitKey] = '0.00'
    } else limits[key as LimitKey] = parsed
  }
  return limits
}

type PlanVersionRow = {
  id: string
  planId: string
  planKey: string
  planName: string
  sortOrder: number
  archivedAt: Date | null
  version: number
  features: string[]
  limits: unknown
}

/** A plan version's limits; a malformed one (publish validates, so never expected) counts as 0. */
function planBaseLimits(row: PlanVersionRow, unknown: Set<string>) {
  const bad = new Set<string>()
  const limits = parseLimits(row.limits, bad, 'zero')
  for (const key of bad) unknown.add(key)
  if ([...bad].some((k) => k.startsWith('bad-limit:'))) {
    logger.error('A plan version has a malformed limit; it counts as 0 until fixed', {
      planKey: row.planKey,
      version: row.version,
      keys: [...bad],
    })
  }
  return limits
}

function toPlanVersion(row: PlanVersionRow, unknown: Set<string>): PlanVersionInfo {
  const features = new Set<FeatureKey>()
  for (const key of row.features) {
    if (isFeatureKey(key)) features.add(key)
    else unknown.add(key)
  }
  return {
    id: row.id,
    planId: row.planId,
    planKey: row.planKey,
    planName: row.planName,
    sortOrder: row.sortOrder,
    version: row.version,
    features,
    limits: planBaseLimits(row, unknown),
  }
}

function selectPlanVersions(db: DbOrTx) {
  return db
    .select({
      id: planVersions.id,
      planId: planVersions.planId,
      planKey: plans.key,
      planName: plans.name,
      sortOrder: plans.sortOrder,
      archivedAt: plans.archivedAt,
      version: planVersions.version,
      features: planVersions.features,
      limits: planVersions.limits,
    })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
}

/** The latest version of each live plan, lowest sort order first. */
export function latestPlansOf(
  rows: readonly PlanVersionRow[],
  infos: Map<string, PlanVersionInfo>,
) {
  const latest = new Map<string, PlanVersionRow>()
  for (const row of rows) {
    if (row.archivedAt) continue
    const current = latest.get(row.planId)
    if (!current || row.version > current.version) latest.set(row.planId, row)
  }
  return [...latest.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((row) => infos.get(row.id) ?? [])
}

/**
 * Loads everything availability needs in five small queries: stages, plan versions, and the
 * live-ish overrides, add-ons and trials (not cleared or cancelled, not already expired). Expiry is checked
 * again at read time, so a row that lapses between loads stops applying on the dot.
 * With `organizationId`, only that organization's rows are loaded (limits, jobs, commands).
 */
export async function loadSnapshot(
  db: DbOrTx,
  options: { organizationId?: string; now?: Date } = {},
): Promise<Snapshot> {
  const now = options.now ?? new Date()
  const orgFilter = (column: PgColumn) =>
    options.organizationId ? eq(column, options.organizationId) : undefined
  const [stageRows, versionRows, overrideRows, addOnRows, trialRows] = await runQueries(db, [
    () =>
      db
        .select({ key: featureReleases.featureKey, stage: featureReleases.stage })
        .from(featureReleases),
    () => selectPlanVersions(db),
    () =>
      db
        .select({
          organizationId: organizationOverrides.organizationId,
          kind: organizationOverrides.kind,
          key: organizationOverrides.key,
          enabled: organizationOverrides.enabled,
          limitValue: organizationOverrides.limitValue,
          expiresAt: organizationOverrides.expiresAt,
          trialId: organizationOverrides.trialId,
        })
        .from(organizationOverrides)
        .where(
          and(
            isNull(organizationOverrides.clearedAt),
            or(isNull(organizationOverrides.expiresAt), gt(organizationOverrides.expiresAt, now)),
            orgFilter(organizationOverrides.organizationId),
          ),
        ),
    () =>
      db
        .select({
          organizationId: organizationAddOns.organizationId,
          addOnKey: organizationAddOns.addOnKey,
          limitIncreases: organizationAddOns.limitIncreases,
          startsAt: organizationAddOns.startsAt,
          endsAt: organizationAddOns.endsAt,
        })
        .from(organizationAddOns)
        .where(
          and(
            isNull(organizationAddOns.cancelledAt),
            or(isNull(organizationAddOns.endsAt), gt(organizationAddOns.endsAt, now)),
            orgFilter(organizationAddOns.organizationId),
          ),
        ),
    () =>
      db
        .select({
          organizationId: organizationTrials.organizationId,
          id: organizationTrials.id,
          planName: plans.name,
          endsOn: organizationTrials.endsOn,
          expiresAt: organizationTrials.expiresAt,
        })
        .from(organizationTrials)
        .innerJoin(planVersions, eq(planVersions.id, organizationTrials.planVersionId))
        .innerJoin(plans, eq(plans.id, planVersions.planId))
        .where(
          and(
            isNull(organizationTrials.cancelledAt),
            gt(organizationTrials.expiresAt, now),
            orgFilter(organizationTrials.organizationId),
          ),
        ),
  ])

  // A flag removed from the code leaves its key in the data: ignored, and reported once per load.
  const unknown = new Set<string>()
  const stages = new Map<FeatureKey, ReleaseStage>()
  for (const row of stageRows) {
    if (isFeatureKey(row.key)) stages.set(row.key, row.stage)
    else unknown.add(row.key)
  }
  const planVersionMap = new Map<string, PlanVersionInfo>()
  for (const row of versionRows) planVersionMap.set(row.id, toPlanVersion(row, unknown))

  const organizations = new Map<
    string,
    { overrides: OverrideRow[]; addOns: AddOnRow[]; trials: TrialRow[] }
  >()
  const rowsFor = (id: string) => {
    let rows = organizations.get(id)
    if (!rows) {
      rows = { overrides: [], addOns: [], trials: [] }
      organizations.set(id, rows)
    }
    return rows
  }
  for (const { organizationId, ...o } of overrideRows) rowsFor(organizationId).overrides.push(o)
  for (const { organizationId, limitIncreases, ...a } of addOnRows) {
    rowsFor(organizationId).addOns.push({
      ...a,
      limitIncreases: parseLimits(limitIncreases, unknown),
    })
  }
  for (const { organizationId, ...t } of trialRows) rowsFor(organizationId).trials.push(t)
  if (unknown.size > 0) {
    logger.warn('Feature data names keys the catalog does not know', { keys: [...unknown] })
  }
  return {
    stages,
    planVersions: planVersionMap,
    latestPlans: latestPlansOf(versionRows, planVersionMap),
    organizations: organizations as Map<string, OrganizationRows>,
    loadedAt: now,
  }
}

export type OrganizationPlanRow = {
  releaseGroup: 'standard' | 'pilot' | 'internal'
  planVersionId: string | null
}

/** The organization's release group and plan version; standard with no plan when it has no row yet. */
export async function loadOrganizationPlan(
  db: DbOrTx,
  organizationId: string,
  options: { lock?: boolean } = {},
): Promise<OrganizationPlanRow> {
  const query = db
    .select({
      releaseGroup: organizationPlans.releaseGroup,
      planVersionId: organizationPlans.planVersionId,
    })
    .from(organizationPlans)
    .where(eq(organizationPlans.organizationId, organizationId))
  const [row] = options.lock ? await query.for('update') : await query
  return row ?? { releaseGroup: 'standard', planVersionId: null }
}

/**
 * Availability read fresh from the database, for jobs, messages and commands (never per
 * request: requests use the in-memory snapshot). Jobs check this at send time.
 */
export async function availabilityForOrganization(
  db: DbOrTx,
  organizationId: string,
  now = new Date(),
): Promise<OrganizationAvailability> {
  return (await loadOrganizationState(db, organizationId, now)).availability
}

/** The organization's availability and the snapshot it came from (its overrides, trials). */
export async function loadOrganizationState(
  db: DbOrTx,
  organizationId: string,
  now = new Date(),
): Promise<{ snapshot: Snapshot; availability: OrganizationAvailability }> {
  const snapshot = await loadSnapshot(db, { organizationId, now })
  const plan = await loadOrganizationPlan(db, organizationId)
  return {
    snapshot,
    availability: organizationAvailability(snapshot, { organizationId, ...plan }, now),
  }
}

/** Makes sure the organization has its plan row (old code may have created it without one). */
export async function ensureOrganizationPlanRow(db: DbOrTx, organizationId: string): Promise<void> {
  await db.execute(sql`
    insert into organization_plans (organization_id) values (${organizationId})
    on conflict (organization_id) do nothing
  `)
}
