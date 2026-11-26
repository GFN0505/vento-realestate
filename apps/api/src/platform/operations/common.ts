import {
  COUNT_LIMIT_KEYS,
  type CountLimitKey,
  type FeatureKey,
  featureLabel,
  type LimitKey,
} from '@vento/shared'
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { organizationOverrides, organizations, plans, planVersions } from '@/db/schema'
import { formatDate } from '@/lib/format'
import type { OverrideKind } from '../availability'
import { CommandError } from '../command-error'
import { endOfLagosDay } from '../dates'
import type { PlatformActor } from '../platform-audit'
import {
  ensureOrganizationPlanRow,
  loadOrganizationPlan,
  type OrganizationPlanRow,
} from '../snapshot'

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
  if (!row) throw new CommandError('No organization with that id.')
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
  if (rows.length === 0) throw new CommandError(`No organization is called "${nameOrId}".`)
  if (rows.length > 1) {
    throw new CommandError(
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
    throw new CommandError(
      version === undefined
        ? `No plan "${planKey}". Run plans list to see them.`
        : `${planKey} has no version ${version}.`,
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

/** `--until 2027-01-31`: applies through that Lagos day. */
export function untilToExpiry(until: string | undefined, now: Date): Date | null {
  if (!until) return null
  if (!isRealIsoDate(until)) {
    throw new CommandError('Write --until as YYYY-MM-DD, e.g. 2027-01-31.')
  }
  const expiresAt = endOfLagosDay(until)
  if (expiresAt <= now) throw new CommandError('--until must be today or later.')
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

export function requireReason(reason: string | undefined): string {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 3) throw new CommandError('Add --reason so the audit trail says why.')
  return trimmed
}
