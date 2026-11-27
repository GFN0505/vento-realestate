import {
  COUNT_LIMIT_KEYS,
  type CountLimitKey,
  type FeatureKey,
  featureLabel,
  type LimitKey,
} from '@vento/shared'
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  organizationOverrides,
  organizations,
  plans,
  planVersions,
  platformAuditEvents,
} from '@/db/schema'
import { formatDate } from '@/lib/format'
import type { OverrideKind } from '../availability'
import { endOfLagosDay } from '../dates'
import type { PlatformActor } from '../platform-audit'
import { PlatformError } from '../platform-error'
import {
  ensureOrganizationPlanRow,
  loadOrganizationPlan,
  loadSnapshot,
  type OrganizationPlanRow,
} from '../snapshot'
import { describePlatformEvent } from './describe'

export type OrganizationRef = { id: string; name: string }

/** Locks the organization's plan row (creating it if old code didn't) for the change. */
export async function lockOrganizationPlan(
  tx: DbOrTx,
  organizationId: string,
): Promise<OrganizationPlanRow> {
  await ensureOrganizationPlanRow(tx, organizationId)
  return loadOrganizationPlan(tx, organizationId, { lock: true })
}

export async function organizationById(db: DbOrTx, id: string): Promise<OrganizationRef> {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, id))
  if (!row) throw new PlatformError('No organization with that id.', 'not_found')
  return row
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** By id, or by exact name (case-insensitive). Two organizations with the name: refused, listed. */
export async function resolveOrganization(db: DbOrTx, nameOrId: string): Promise<OrganizationRef> {
  if (UUID.test(nameOrId)) return organizationById(db, nameOrId)
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`lower(${organizations.name}) = lower(${nameOrId.trim()})`)
  if (rows.length === 0) {
    throw new PlatformError(`No organization is called "${nameOrId}".`, 'not_found')
  }
  if (rows.length > 1) {
    throw new PlatformError(
      `${rows.length} organizations are called "${nameOrId}". Use the id:\n${rows.map((r) => `  ${r.id}  ${r.name}`).join('\n')}`,
    )
  }
  return rows[0] as OrganizationRef
}

export type PlanVersionRef = {
  planId: string
  planKey: string
  planName: string
  sortOrder: number
  versionId: string
  version: number
  features: string[]
  limits: Record<string, unknown>
}

/** The latest version of a plan, or a given version. */
export async function findPlanVersion(
  db: DbOrTx,
  planKey: string,
  version?: number,
): Promise<PlanVersionRef> {
  const [row] = await db
    .select({
      planId: plans.id,
      planKey: plans.key,
      planName: plans.name,
      sortOrder: plans.sortOrder,
      versionId: planVersions.id,
      version: planVersions.version,
      features: planVersions.features,
      limits: planVersions.limits,
    })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(
      and(
        eq(plans.key, planKey),
        isNull(plans.archivedAt),
        version === undefined ? undefined : eq(planVersions.version, version),
      ),
    )
    .orderBy(desc(planVersions.version))
    .limit(1)
  if (!row) {
    throw new PlatformError(
      version === undefined ? `No plan "${planKey}".` : `${planKey} has no version ${version}.`,
      'not_found',
      { missing: 'plan' },
    )
  }
  return { ...row, limits: (row.limits ?? {}) as Record<string, unknown> }
}

/** Clears the live override for (kind, key), if any, and returns what it was. */
export async function clearOverride(
  tx: DbOrTx,
  actor: PlatformActor,
  organizationId: string,
  kind: OverrideKind,
  key: string,
) {
  const [cleared] = await tx
    .update(organizationOverrides)
    .set({ clearedAt: new Date(), clearedByUserId: actor.userId })
    .where(
      and(
        eq(organizationOverrides.organizationId, organizationId),
        eq(organizationOverrides.kind, kind),
        eq(organizationOverrides.key, key),
        isNull(organizationOverrides.clearedAt),
      ),
    )
    .returning({
      id: organizationOverrides.id,
      enabled: organizationOverrides.enabled,
      limitValue: organizationOverrides.limitValue,
      expiresAt: organizationOverrides.expiresAt,
      trialId: organizationOverrides.trialId,
    })
  return cleared ?? null
}

/**
 * Marks overrides that already expired as cleared, so a new one for the same key can take the
 * "one live override" slot (the unique index counts every row not cleared). Expired rows
 * stopped applying at their expiry; this only records it.
 */
export async function clearExpiredOverrides(
  tx: DbOrTx,
  actor: Pick<PlatformActor, 'userId'>,
  now: Date,
  scope: { organizationId?: string; kind?: OverrideKind; keys?: readonly string[] } = {},
): Promise<number> {
  if (scope.keys && scope.keys.length === 0) return 0
  const cleared = await tx
    .update(organizationOverrides)
    .set({ clearedAt: now, clearedByUserId: actor.userId })
    .where(
      and(
        isNull(organizationOverrides.clearedAt),
        lte(organizationOverrides.expiresAt, now),
        scope.organizationId
          ? eq(organizationOverrides.organizationId, scope.organizationId)
          : undefined,
        scope.kind ? eq(organizationOverrides.kind, scope.kind) : undefined,
        scope.keys ? inArray(organizationOverrides.key, [...scope.keys]) : undefined,
      ),
    )
    .returning({ id: organizationOverrides.id })
  return cleared.length
}

/** A real calendar date written YYYY-MM-DD (refuses 2027-02-30). */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** An end date like 2027-01-31: applies through that Lagos day. */
export function untilToExpiry(until: string | undefined, now: Date): Date | null {
  if (!until) return null
  if (!isRealIsoDate(until)) {
    throw new PlatformError('Write the end date as YYYY-MM-DD, e.g. 2027-01-31.')
  }
  const expiresAt = endOfLagosDay(until)
  if (expiresAt <= now) throw new PlatformError('The end date must be today or later.')
  return expiresAt
}

/** "2 Jan 2027" for a Lagos calendar date. */
export function formatIsoDate(isoDate: string): string {
  return formatDate(new Date(`${isoDate}T12:00:00Z`))
}

export function isCountLimit(key: LimitKey): key is CountLimitKey {
  return (COUNT_LIMIT_KEYS as readonly string[]).includes(key)
}

/** "₦150,000" from a decimal string, without going through a float. */
export function naira(amount: string): string {
  const formatted = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(
    amount as Intl.StringNumericLiteral,
  )
  return `₦${formatted}`
}

export function labels(keys: readonly FeatureKey[]): string {
  const names = keys.map(featureLabel)
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** The override not yet cleared for (kind, key), if any: the before-state a console change checks. */
export async function currentOverrideId(
  db: DbOrTx,
  organizationId: string,
  kind: OverrideKind,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: organizationOverrides.id })
    .from(organizationOverrides)
    .where(
      and(
        eq(organizationOverrides.organizationId, organizationId),
        eq(organizationOverrides.kind, kind),
        eq(organizationOverrides.key, key),
        isNull(organizationOverrides.clearedAt),
      ),
    )
  return row?.id ?? null
}

/** Where to look for the change that made a preview stale. */
export type StaleTarget =
  | { organizationId: string }
  | { targetType: 'feature' | 'plan'; targetKey: string }

/**
 * The state moved since the preview: names who moved it and how, from the newest platform audit
 * event on the target ("Ada Okafor moved Sales to pilot since you opened this. …").
 */
export async function staleError(db: DbOrTx, target: StaleTarget): Promise<PlatformError> {
  const [event] = await db
    .select({
      action: platformAuditEvents.action,
      actorName: platformAuditEvents.actorName,
      targetType: platformAuditEvents.targetType,
      targetKey: platformAuditEvents.targetKey,
      before: platformAuditEvents.before,
      after: platformAuditEvents.after,
      organizationName: organizations.name,
    })
    .from(platformAuditEvents)
    .leftJoin(organizations, eq(organizations.id, platformAuditEvents.organizationId))
    .where(
      'organizationId' in target
        ? eq(platformAuditEvents.organizationId, target.organizationId)
        : and(
            eq(platformAuditEvents.targetType, target.targetType),
            eq(platformAuditEvents.targetKey, target.targetKey),
          ),
    )
    .orderBy(desc(platformAuditEvents.createdAt))
    .limit(1)
  if (!event) {
    return new PlatformError(
      'This changed since you opened it. Check the preview and try again.',
      'stale',
    )
  }
  const { summary } = describePlatformEvent(event)
  const what = summary.charAt(0).toLowerCase() + summary.slice(1)
  return new PlatformError(
    `${event.actorName} ${what} since you opened this. Check the preview and try again.`,
    'stale',
    { changedByName: event.actorName },
  )
}

/** Compares the previewed before-state, after the change's lock is held. Absent = the command. */
export async function assertExpected<T>(
  db: DbOrTx,
  expected: T | undefined,
  actual: T,
  target: StaleTarget,
): Promise<void> {
  if (expected === undefined) return
  if (JSON.stringify(expected) === JSON.stringify(actual)) return
  throw await staleError(db, target)
}

/** Everything a preview needs about one organization: its snapshot rows and plan row. */
export async function organizationState(db: DbOrTx, organizationId: string, now: Date) {
  const [snapshot, plan] = await runQueries(db, [
    () => loadSnapshot(db, { organizationId, now }),
    () => loadOrganizationPlan(db, organizationId),
  ])
  return { snapshot, plan: { organizationId, ...plan } }
}
