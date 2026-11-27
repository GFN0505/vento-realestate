import type {
  ActivityKind,
  ActivityPage,
  ActivityRow,
  ListActivityInput,
  PlatformChannel,
} from '@vento/shared/console'
import { listActivityInput } from '@vento/shared/console'
import { and, desc, eq, gte, inArray, isNotNull, lt, max, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { organizations, platformAuditEvents } from '@/db/schema'
import { pageOffset, toPage } from '@/lib/paginate'
import { addDays, endOfLagosDay } from '../dates'
import { describePlatformEvent } from '../operations/describe'
import { SCHEDULED_ACTOR_NAMES } from '../platform-audit'

// Vento Real Estate's own activity trail, in words (admin-console plan §5.3). A staff person's
// own account events (channel `account`) are kept for investigations but never listed (§1b.11).

const KIND_ACTIONS: Record<ActivityKind, string[]> = {
  release: ['release.stage_changed', 'release.group_changed'],
  plan: ['plan.published', 'plan.assigned'],
  trial: ['plan.trial_started', 'plan.trial_ended', 'plan.trial_cancelled'],
  add_on: ['plan.add_on_added', 'plan.add_on_changed', 'plan.add_on_removed'],
  override: [
    'release.override_set',
    'release.override_cleared',
    'plan.feature_overridden',
    'plan.limit_overridden',
    'plan.override_cleared',
  ],
  super_admin: [
    'superadmin.granted',
    'superadmin.revoked',
    'superadmin.invited',
    'superadmin.invitation_resent',
    'superadmin.invitation_withdrawn',
    'superadmin.joined',
    'superadmin.two_step_reset',
  ],
}

export const ACTIVITY_COLUMNS = {
  id: platformAuditEvents.id,
  at: platformAuditEvents.createdAt,
  actorName: platformAuditEvents.actorName,
  actorUserId: platformAuditEvents.actorUserId,
  channel: platformAuditEvents.channel,
  operator: platformAuditEvents.operator,
  action: platformAuditEvents.action,
  targetType: platformAuditEvents.targetType,
  targetKey: platformAuditEvents.targetKey,
  before: platformAuditEvents.before,
  after: platformAuditEvents.after,
  reason: platformAuditEvents.reason,
  organizationId: platformAuditEvents.organizationId,
  organizationName: organizations.name,
}

export type ActivityEventRow = {
  id: string
  at: Date
  actorName: string
  actorUserId: string | null
  channel: PlatformChannel | 'account' | null
  operator: string | null
  action: string
  targetType: string
  targetKey: string | null
  before: unknown
  after: unknown
  reason: string
  organizationId: string | null
  organizationName: string | null
}

/** Changes only: never a staff person's own account events. */
export const notAccountEvent = sql`${platformAuditEvents.channel} is distinct from 'account'`

/**
 * Rows written before the console have no channel: scheduled runs by name (old or new), else a
 * command. `account` rows are never read as activity; listed as console if one slips through.
 */
export function channelOf(row: Pick<ActivityEventRow, 'channel' | 'actorName'>): PlatformChannel {
  if (row.channel === 'account') return 'console'
  if (row.channel) return row.channel
  return SCHEDULED_ACTOR_NAMES.includes(row.actorName) ? 'scheduled' : 'command'
}

export function toActivityRow(row: ActivityEventRow): ActivityRow {
  const words = describePlatformEvent(row)
  return {
    id: row.id,
    at: row.at.toISOString(),
    actorName: row.actorName,
    actorUserId: row.actorUserId,
    channel: channelOf(row),
    operator: row.operator,
    summary: words.summary,
    organization:
      row.organizationId && row.organizationName
        ? { id: row.organizationId, name: row.organizationName }
        : null,
    featureKey: row.targetType === 'feature' ? row.targetKey : null,
    change: words.change,
    reason: row.reason,
  }
}

function filters(input: ReturnType<typeof listActivityInput.parse>): SQL | undefined {
  return and(
    notAccountEvent,
    input.actorUserId ? eq(platformAuditEvents.actorUserId, input.actorUserId) : undefined,
    input.organizationId ? eq(platformAuditEvents.organizationId, input.organizationId) : undefined,
    input.featureKey
      ? and(
          eq(platformAuditEvents.targetType, 'feature'),
          eq(platformAuditEvents.targetKey, input.featureKey),
        )
      : undefined,
    input.kind ? inArray(platformAuditEvents.action, KIND_ACTIONS[input.kind]) : undefined,
    // Lagos dates, inclusive.
    input.from
      ? gte(platformAuditEvents.createdAt, endOfLagosDay(addDays(input.from, -1)))
      : undefined,
    input.to ? lt(platformAuditEvents.createdAt, endOfLagosDay(input.to)) : undefined,
  )
}

export async function list(db: DbOrTx, raw: ListActivityInput): Promise<ActivityPage> {
  const input = listActivityInput.parse(raw)
  const where = filters(input)
  const { limit, offset } = pageOffset(input)
  const [rows, total, named] = await runQueries(db, [
    () =>
      db
        .select(ACTIVITY_COLUMNS)
        .from(platformAuditEvents)
        .leftJoin(organizations, eq(organizations.id, platformAuditEvents.organizationId))
        .where(where)
        .orderBy(desc(platformAuditEvents.createdAt), desc(platformAuditEvents.id))
        .limit(limit)
        .offset(offset),
    () => db.select({ n: sql<number>`count(*)::int` }).from(platformAuditEvents).where(where),
    // Named even with no rows yet, so the filter chip can say whose activity this is.
    async () =>
      input.organizationId
        ? db
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, input.organizationId))
        : [],
  ])
  const page = toPage(rows.map(toActivityRow), input, total[0]?.n ?? 0)
  return input.organizationId ? { ...page, organizationName: named[0]?.name ?? null } : page
}

/** Everyone who appears as an actor, with the name they had most recently. */
export async function people(db: DbOrTx): Promise<{ userId: string; name: string }[]> {
  const latest = max(platformAuditEvents.createdAt)
  const rows = await db
    .select({
      userId: platformAuditEvents.actorUserId,
      name: sql<string>`(array_agg(${platformAuditEvents.actorName} order by ${platformAuditEvents.createdAt} desc))[1]`,
      latest,
    })
    .from(platformAuditEvents)
    .where(and(isNotNull(platformAuditEvents.actorUserId), notAccountEvent))
    .groupBy(platformAuditEvents.actorUserId)
    .orderBy(desc(latest))
  return rows.flatMap((r) => (r.userId ? [{ userId: r.userId, name: r.name }] : []))
}
