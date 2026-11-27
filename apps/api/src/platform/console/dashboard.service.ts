import { FEATURE_KEYS } from '@vento/shared'
import type { AttentionItem, Dashboard } from '@vento/shared/console'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { organizations, platformAuditEvents } from '@/db/schema'
import { stageOf } from '../availability'
import { addDays, lagosToday } from '../dates'
import { describePlatformEvent } from '../operations/describe'
import { SCHEDULED_ACTOR_NAMES } from '../platform-audit'
import { loadSnapshot } from '../snapshot'
import { ACTIVITY_COLUMNS, notAccountEvent, toActivityRow } from './activity.service'
import { customerFeed, NOT_INTERNAL } from './customer-activity'
import { limitStanding } from './organizations.service'

// The console's home (admin-console plan §1b.9): one read, the queries side by side. Every
// number comes from data that exists today; internal organizations are left out of all of them
// and counted only as "Internal" under Organizations by plan. Account-level facts only.

const DAY = 24 * 60 * 60_000
const QUEUE_SHOWN = 8
const FEED_SHOWN = 15
const RECENT_SHOWN = 5
const QUIET_DAYS = 14

/** Customer organizations (internal left out), as a subquery every count reads from. */
const CUSTOMERS = sql`(select o.id, o.name, o.created_at, op.plan_version_id
  from organizations o left join organization_plans op on op.organization_id = o.id
  where ${NOT_INTERNAL})`

type Counts = Record<string, number | string>

async function counts(db: DbOrTx, now: Date): Promise<Counts> {
  const at = now.toISOString()
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString()
  const soon = addDays(lagosToday(now), 7)
  const result = await db.execute<Counts>(sql`
    with c as ${CUSTOMERS}
    select
      (select count(*) from c)::int as organizations,
      (select count(distinct m.user_id) from members m join c on c.id = m.organization_id
        where m.status = 'active')::int as people,
      (select count(*) from c where c.created_at >= ${weekAgo}::timestamptz)::int as new_last_7,
      (select count(distinct m.user_id) from members m join c on c.id = m.organization_id
        where m.status = 'active' and m.last_active_at >= ${weekAgo}::timestamptz)::int
        as active_people,
      (select count(distinct m.organization_id) from members m join c on c.id = m.organization_id
        where m.status = 'active' and m.last_active_at >= ${weekAgo}::timestamptz)::int
        as active_organizations,
      (select count(distinct t.organization_id) from organization_trials t
        join c on c.id = t.organization_id
        where t.cancelled_at is null and t.expires_at > ${at}::timestamptz
          and t.ends_on <= ${soon}::date)::int as trials_ending,
      (select count(*) from organization_trials t join c on c.id = t.organization_id
        where t.starts_at >= ${weekAgo}::timestamptz)::int as trials_started,
      (select count(*) from invitations i join c on c.id = i.organization_id
        where i.created_at >= ${weekAgo}::timestamptz)::int as invitations_sent,
      (select count(*) from invitations i join c on c.id = i.organization_id
        where i.status = 'accepted' and i.responded_at >= ${weekAgo}::timestamptz)::int
        as invitations_accepted,
      (select count(*) from users u
        where u.account_kind = 'customer' and u.email_verified
          and u.created_at >= ${weekAgo}::timestamptz
          and not exists (select 1 from members m where m.user_id = u.id))::int
        as sign_ups_not_finished,
      (select count(*) from organizations o
        join organization_plans op on op.organization_id = o.id
        where op.release_group = 'internal')::int as internal,
      (select count(*) from c where c.plan_version_id is null)::int as no_plan`)
  return result.rows[0] ?? {}
}

const n = (r: Counts, key: string): number => Number(r[key] ?? 0)

type Listed<T> = { rows: T[]; total: number }

/** Command-line changes in 7 days (legacy rows with no channel count, scheduled ones don't). */
async function commandLine(db: DbOrTx, since: Date, limit: number): Promise<Listed<AttentionItem>> {
  const scheduled = sql.join(
    SCHEDULED_ACTOR_NAMES.map((name) => sql`${name}`),
    sql`, `,
  )
  const where = and(
    gte(platformAuditEvents.createdAt, since),
    sql`(${platformAuditEvents.channel} = 'command' or (${platformAuditEvents.channel} is null
      and ${platformAuditEvents.actorName} not in (${scheduled})))`,
  )
  const [rows, total] = await runQueries(db, [
    () =>
      db
        .select(ACTIVITY_COLUMNS)
        .from(platformAuditEvents)
        .leftJoin(organizations, eq(organizations.id, platformAuditEvents.organizationId))
        .where(where)
        .orderBy(desc(platformAuditEvents.createdAt), desc(platformAuditEvents.id))
        .limit(limit),
    () => db.select({ n: sql<number>`count(*)::int` }).from(platformAuditEvents).where(where),
  ])
  return {
    rows: rows.map((r) => ({
      kind: 'command_line',
      eventId: r.id,
      at: r.at.toISOString(),
      actorName: r.actorName,
      summary: describePlatformEvent(r).summary,
    })),
    total: total[0]?.n ?? 0,
  }
}

type TrialRow = { id: string; name: string; plan_name: string; ends_on: string; total: number }

async function trialsEnding(db: DbOrTx, now: Date, limit: number): Promise<Listed<AttentionItem>> {
  const result = await db.execute<TrialRow>(sql`
    with c as ${CUSTOMERS},
    t as (
      select distinct on (t.organization_id) t.organization_id, t.ends_on, p.name as plan_name
      from organization_trials t
      join c on c.id = t.organization_id
      join plan_versions pv on pv.id = t.plan_version_id
      join plans p on p.id = pv.plan_id
      where t.cancelled_at is null and t.expires_at > ${now.toISOString()}::timestamptz
        and t.ends_on <= ${addDays(lagosToday(now), 7)}::date
      order by t.organization_id, t.ends_on)
    select c.id, c.name, t.plan_name, to_char(t.ends_on, 'YYYY-MM-DD') as ends_on,
      count(*) over ()::int as total
    from t join c on c.id = t.organization_id
    order by t.ends_on, c.name
    limit ${limit}`)
  return {
    rows: result.rows.map((r) => ({
      kind: 'trial_ending',
      organization: { id: r.id, name: r.name },
      planName: r.plan_name,
      endsOn: r.ends_on,
    })),
    total: Number(result.rows[0]?.total ?? 0),
  }
}

async function noPlan(db: DbOrTx, limit: number): Promise<Listed<AttentionItem>> {
  const result = await db.execute<{ id: string; name: string; total: number }>(sql`
    with c as ${CUSTOMERS}
    select c.id, c.name, count(*) over ()::int as total from c
    where c.plan_version_id is null
    order by c.name, c.id
    limit ${limit}`)
  return {
    rows: result.rows.map((r) => ({ kind: 'no_plan', organization: { id: r.id, name: r.name } })),
    total: Number(result.rows[0]?.total ?? 0),
  }
}

/** Nobody active for 14 days, in organizations older than that; longest quiet first. */
async function quiet(db: DbOrTx, now: Date, limit: number): Promise<Listed<AttentionItem>> {
  const cutoff = new Date(now.getTime() - QUIET_DAYS * DAY).toISOString()
  const result = await db.execute<{ id: string; name: string; days: number; total: number }>(sql`
    with c as ${CUSTOMERS},
    q as (
      select c.id, c.name,
        coalesce(max(m.last_active_at), c.created_at) as last_seen
      from c left join members m on m.organization_id = c.id and m.status = 'active'
      where c.created_at < ${cutoff}::timestamptz
      group by c.id, c.name, c.created_at
      having coalesce(max(m.last_active_at), c.created_at) < ${cutoff}::timestamptz)
    select id, name,
      floor(extract(epoch from (${now.toISOString()}::timestamptz - last_seen)) / 86400)::int as days,
      count(*) over ()::int as total
    from q
    order by last_seen, name
    limit ${limit}`)
  return {
    rows: result.rows.map((r) => ({
      kind: 'quiet',
      organization: { id: r.id, name: r.name },
      days: Number(r.days),
    })),
    total: Number(result.rows[0]?.total ?? 0),
  }
}

type PlanCount = { key: string; name: string; version: number; organizations: number }

async function planCounts(db: DbOrTx): Promise<PlanCount[]> {
  const result = await db.execute<PlanCount>(sql`
    with c as ${CUSTOMERS}
    select p.key, p.name, pv.version, count(*)::int as organizations
    from c join plan_versions pv on pv.id = c.plan_version_id join plans p on p.id = pv.plan_id
    group by p.key, p.name, p.sort_order, pv.version
    order by p.sort_order, pv.version desc`)
  return result.rows.map((r) => ({
    ...r,
    version: Number(r.version),
    organizations: Number(r.organizations),
  }))
}

/** Over a limit, worst excess first ("People 17 of 15"). */
async function overLimit(
  db: DbOrTx,
  now: Date,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  const [standing, names] = await runQueries(db, [
    () => limitStanding(db, now, snapshot),
    () =>
      db.execute<{ id: string; name: string }>(sql`with c as ${CUSTOMERS} select id, name from c`),
  ])
  const customer = new Map(names.rows.map((r) => [r.id, r.name]))
  let atLimit = 0
  const over: { item: AttentionItem; excess: number }[] = []
  for (const [id, s] of standing) {
    const name = customer.get(id)
    if (name === undefined) continue
    const worst = [...s.over].sort((a, b) => b.used - b.included - (a.used - a.included))[0]
    if (worst) {
      over.push({
        excess: worst.used - worst.included,
        item: {
          kind: 'over_limit',
          organization: { id, name },
          limit: worst.key,
          used: worst.used,
          included: worst.included,
        },
      })
    } else if (s.at.length) atLimit += 1
  }
  over.sort((a, b) => b.excess - a.excess || nameOf(a.item).localeCompare(nameOf(b.item)))
  return { rows: over.map((o) => o.item), total: over.length, atLimit }
}

function nameOf(item: AttentionItem): string {
  return 'organization' in item ? item.organization.name : ''
}

type Snap = Awaited<ReturnType<typeof loadSnapshot>>

/**
 * Needs attention, kind by kind in spec order (command line, trials ending, over a limit, no
 * plan, gone quiet), each list up to `limit` rows with its full count. The Dashboard shows the
 * first 8 of them all; tests read further.
 */
export async function attentionQueue(db: DbOrTx, now: Date, snapshot: Snap, limit = QUEUE_SHOWN) {
  const weekAgo = new Date(now.getTime() - 7 * DAY)
  const [cli, trials, limits, unplanned, quietOnes] = await runQueries(db, [
    () => commandLine(db, weekAgo, limit),
    () => trialsEnding(db, now, limit),
    () => overLimit(db, now, snapshot),
    () => noPlan(db, limit),
    () => quiet(db, now, limit),
  ])
  return { lists: [cli, trials, limits, unplanned, quietOnes], atLimit: limits.atLimit }
}

export async function get(db: DbOrTx, now = new Date()): Promise<Dashboard> {
  const weekAgo = new Date(now.getTime() - 7 * DAY)
  const snapshot = await loadSnapshot(db, { now })
  const [c, queue, feed, byPlan, recent] = await runQueries(db, [
    () => counts(db, now),
    () => attentionQueue(db, now, snapshot),
    () => customerFeed(db, { since: weekAgo, limit: FEED_SHOWN }),
    () => planCounts(db),
    () =>
      db
        .select(ACTIVITY_COLUMNS)
        .from(platformAuditEvents)
        .leftJoin(organizations, eq(organizations.id, platformAuditEvents.organizationId))
        .where(notAccountEvent)
        .orderBy(desc(platformAuditEvents.createdAt), desc(platformAuditEvents.id))
        .limit(RECENT_SHOWN),
  ])
  const [, , limits] = queue.lists
  const all = queue.lists.flatMap((q) => q.rows)
  const total = queue.lists.reduce((sum, q) => sum + q.total, 0)
  const items = all.slice(0, QUEUE_SHOWN)
  return {
    header: { organizations: n(c, 'organizations'), people: n(c, 'people') },
    numbers: {
      organizations: n(c, 'organizations'),
      newLast7Days: n(c, 'new_last_7'),
      activePeople: n(c, 'active_people'),
      activeOrganizations: n(c, 'active_organizations'),
      trialsEndingSoon: n(c, 'trials_ending'),
      overLimit: limits?.total ?? 0,
      atLimit: queue.atLimit,
    },
    attention: { items, more: total - items.length },
    activity: {
      summary: {
        newOrganizations: n(c, 'new_last_7'),
        invitationsSent: n(c, 'invitations_sent'),
        invitationsAccepted: n(c, 'invitations_accepted'),
        trialsStarted: n(c, 'trials_started'),
        signUpsNotFinished: n(c, 'sign_ups_not_finished'),
      },
      feed,
    },
    plans: {
      byPlan: plansPanel(snapshot, byPlan),
      internal: n(c, 'internal'),
      noPlan: n(c, 'no_plan'),
      atPilot: FEATURE_KEYS.filter((key) => stageOf(snapshot, key) === 'pilot'),
      recent: recent.map(toActivityRow),
    },
  }
}

/** One row per live plan (sort order), plus any retired plan that still has organizations. */
function plansPanel(
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  rows: PlanCount[],
): Dashboard['plans']['byPlan'] {
  const order = snapshot.latestPlans.map((p) => ({ key: p.planKey, name: p.planName }))
  for (const r of rows) {
    if (!order.some((p) => p.key === r.key)) order.push({ key: r.key, name: r.name })
  }
  return order.map((p) => {
    const versions = rows
      .filter((r) => r.key === p.key)
      .map((r) => ({ version: r.version, organizations: r.organizations }))
    return {
      key: p.key,
      name: p.name,
      total: versions.reduce((sum, v) => sum + v.organizations, 0),
      versions,
    }
  })
}
