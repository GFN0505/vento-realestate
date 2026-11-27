import {
  ADD_ONS,
  type AddOnKey,
  Decimal,
  FEATURE_KEYS,
  featureLabel,
  isAddOnKey,
  isFeatureKey,
  isLimitKey,
} from '@vento/shared'
import type {
  AccountActivity,
  ConsoleOverride,
  EndedOverride,
  FeatureWhy,
  ListOrganizationsInput,
  OrganizationDetail,
  OrganizationRow,
  OrganizationsSummary,
} from '@vento/shared/console'
import { listOrganizationsInput } from '@vento/shared/console'
import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  organizationAddOns,
  organizationOverrides,
  organizations,
  organizationTrials,
  plans,
  planVersions,
  users,
} from '@/db/schema'
import { notFound } from '@/lib/errors'
import { likePattern } from '@/lib/like'
import { pageOffset, toPage } from '@/lib/paginate'
import { organizationAvailability, type Snapshot } from '../availability'
import { addDays, lagosToday } from '../dates'
import { explainFeature } from '../explain'
import { organizationState } from '../operations/common'
import { allOrganizationPlans } from '../operations/release'
import { limitUses } from '../plan-summary'
import { loadSnapshot } from '../snapshot'
import { customerFeed } from './customer-activity'

// The Organizations pages (admin-console plan §9.6). Facts only: the owner's name and email,
// counts and dates. Nothing here reads buyers, money, documents or KYC.

/** Active people and companies per organization, in two grouped queries. */
async function usageByOrganization(db: DbOrTx) {
  const [people, companies] = await runQueries(db, [
    () =>
      db.execute<{ organization_id: string; n: number }>(sql`
        select organization_id, sum(n)::int as n from (
          select organization_id, count(*) as n from members where status = 'active'
            group by organization_id
          union all
          select organization_id, count(*) from invitations
            where status = 'pending' and expires_at > now() group by organization_id
        ) u group by organization_id`),
    () =>
      db.execute<{ organization_id: string; n: number }>(sql`
        select organization_id, count(*)::int as n from entities where status = 'active'
        group by organization_id`),
  ])
  const toMap = (rows: { organization_id: string; n: number }[]) =>
    new Map(rows.map((r) => [r.organization_id, Number(r.n)]))
  return { members: toMap(people.rows), entities: toMap(companies.rows) }
}

/** One count limit's use, when an organization is at or over it. */
export type LimitUse = { key: 'members' | 'entities'; used: number; included: number }

/**
 * Each organization at or over a count limit, evaluated in memory per organization in one pass
 * (plan §9.6: fine to a few thousand; revisit with materialised usage beyond that). Only limits
 * a module counts. Internal organizations have no caps, so never appear.
 */
export async function limitStanding(
  db: DbOrTx,
  now: Date,
  snapshot?: Snapshot,
): Promise<Map<string, { over: LimitUse[]; at: LimitUse[] }>> {
  const [snap, orgs, usage] = await runQueries(db, [
    async () => snapshot ?? (await loadSnapshot(db, { now })),
    () => allOrganizationPlans(db),
    () => usageByOrganization(db),
  ])
  const standing = new Map<string, { over: LimitUse[]; at: LimitUse[] }>()
  for (const o of orgs) {
    const a = organizationAvailability(snap, { organizationId: o.id, ...o }, now)
    const over: LimitUse[] = []
    const at: LimitUse[] = []
    for (const key of ['members', 'entities'] as const) {
      const included = a.countLimit(key)
      if (included === null) continue
      const used = usage[key].get(o.id) ?? 0
      if (used > included) over.push({ key, used, included })
      else if (used > 0 && used === included) at.push({ key, used, included })
    }
    if (over.length || at.length) standing.set(o.id, { over, at })
  }
  return standing
}

/** Organizations over a count limit (slice 1's callers). */
export async function overLimitIds(
  db: DbOrTx,
  now: Date,
  snapshot?: Snapshot,
): Promise<Set<string>> {
  const standing = await limitStanding(db, now, snapshot)
  return new Set([...standing].filter(([, s]) => s.over.length > 0).map(([id]) => id))
}

export async function summary(db: DbOrTx, now = new Date()): Promise<OrganizationsSummary> {
  const today = lagosToday(now)
  const monthStart = `${today.slice(0, 7)}-01`
  const [counts, over] = await runQueries(db, [
    () =>
      db.execute<Record<string, number>>(sql`
        select
          (select count(*) from organizations)::int as organizations,
          (select count(*) from members where status = 'active')::int as people,
          (select count(*) from organizations
            where created_at >= (${monthStart}::date)::timestamp at time zone 'Africa/Lagos')::int
            as new_this_month,
          (select count(distinct organization_id) from organization_trials
            where cancelled_at is null and expires_at > ${now.toISOString()}::timestamptz)::int
            as on_trial,
          (select count(distinct organization_id) from organization_trials
            where cancelled_at is null and expires_at > ${now.toISOString()}::timestamptz
              and ends_on <= ${addDays(today, 7)}::date)::int as trials_ending,
          (select count(*) from organization_plans where release_group = 'pilot')::int as pilot`),
    () => overLimitIds(db, now),
  ])
  const r = counts.rows[0] ?? {}
  return {
    organizations: Number(r.organizations ?? 0),
    people: Number(r.people ?? 0),
    newThisMonth: Number(r.new_this_month ?? 0),
    onTrial: Number(r.on_trial ?? 0),
    trialsEndingThisWeek: Number(r.trials_ending ?? 0),
    pilot: Number(r.pilot ?? 0),
    overLimit: over.size,
  }
}

type ListRow = {
  id: string
  name: string
  owner_name: string | null
  owner_email: string | null
  plan_name: string | null
  plan_version: number | null
  release_group: 'standard' | 'pilot' | 'internal' | null
  people: number
  companies: number
  last_active_at: Date | string | null
  trial_plan: string | null
  trial_ends_on: string | null
  total: number
}

/** The earliest active owner of `o` (role key `owner`). */
const OWNER = sql`
  left join lateral (
    select u.name, u.email from members m
    join roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join users u on u.id = m.user_id
    where m.organization_id = o.id and m.status = 'active' and r.key = 'owner'
    order by m.joined_at, m.id limit 1
  ) owner on true`

/** One query, sorted by last active; the over-limit set is computed once and joined by id. */
export async function list(
  db: DbOrTx,
  raw: ListOrganizationsInput,
  now = new Date(),
): Promise<{ items: OrganizationRow[]; page: number; pageSize: number; total: number }> {
  const input = listOrganizationsInput.parse(raw)
  const over = await overLimitIds(db, now)
  const { limit, offset } = pageOffset(input)
  const nowText = now.toISOString()
  const filters = [sql`true`]
  if (input.filter === 'pilot') filters.push(sql`op.release_group = 'pilot'`)
  if (input.filter === 'internal') filters.push(sql`op.release_group = 'internal'`)
  if (input.filter === 'trial') filters.push(sql`trial.ends_on is not null`)
  if (input.filter === 'over_limit') {
    const ids = [...over]
    if (ids.length === 0) return toPage([], input, 0)
    filters.push(
      sql`o.id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )
  }
  if (input.planKey) filters.push(sql`p.key = ${input.planKey}`)
  if (input.planKey && input.version) filters.push(sql`pv.version = ${input.version}`)
  if (input.search) {
    const pattern = likePattern(input.search)
    filters.push(sql`(o.name ilike ${pattern} or owner.email ilike ${pattern})`)
  }
  const result = await db.execute<ListRow>(sql`
    select o.id, o.name, owner.name as owner_name, owner.email as owner_email,
      p.name as plan_name, pv.version as plan_version, op.release_group,
      coalesce(people.n, 0)::int as people, coalesce(companies.n, 0)::int as companies,
      people.last_active_at, trial.plan_name as trial_plan, trial.ends_on as trial_ends_on,
      count(*) over ()::int as total
    from organizations o
    left join organization_plans op on op.organization_id = o.id
    left join plan_versions pv on pv.id = op.plan_version_id
    left join plans p on p.id = pv.plan_id
    ${OWNER}
    left join lateral (
      select count(*) as n, max(m.last_active_at) as last_active_at from members m
      where m.organization_id = o.id and m.status = 'active'
    ) people on true
    left join lateral (
      select count(*) as n from entities e where e.organization_id = o.id and e.status = 'active'
    ) companies on true
    left join lateral (
      select tp.name as plan_name, t.ends_on from organization_trials t
      join plan_versions tpv on tpv.id = t.plan_version_id
      join plans tp on tp.id = tpv.plan_id
      where t.organization_id = o.id and t.cancelled_at is null
        and t.expires_at > ${nowText}::timestamptz
      order by t.expires_at desc limit 1
    ) trial on true
    where ${sql.join(filters, sql` and `)}
    order by people.last_active_at desc nulls last, o.name, o.id
    limit ${limit} offset ${offset}`)
  const rows = result.rows
  const items = rows.map(
    (r): OrganizationRow => ({
      id: r.id,
      name: r.name,
      owner: r.owner_name && r.owner_email ? { name: r.owner_name, email: r.owner_email } : null,
      plan: r.plan_name && r.plan_version ? { name: r.plan_name, version: r.plan_version } : null,
      releaseGroup: r.release_group ?? 'standard',
      people: Number(r.people),
      companies: Number(r.companies),
      lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
      trial:
        r.trial_plan && r.trial_ends_on
          ? { planName: r.trial_plan, endsOn: String(r.trial_ends_on).slice(0, 10) }
          : null,
      overLimit: over.has(r.id),
    }),
  )
  return toPage(items, input, rows[0] ? Number(rows[0].total) : 0)
}

async function organizationRow(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name, createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, id))
  if (!row) throw notFound()
  return row
}

async function ownerOf(db: DbOrTx, organizationId: string) {
  const result = await db.execute<{ name: string; email: string }>(sql`
    select owner.name, owner.email from organizations o ${OWNER} where o.id = ${organizationId}`)
  const row = result.rows[0]
  return row?.name ? { name: row.name, email: row.email } : null
}

const OVERRIDE_COLUMNS = {
  id: organizationOverrides.id,
  kind: organizationOverrides.kind,
  key: organizationOverrides.key,
  enabled: organizationOverrides.enabled,
  limitValue: organizationOverrides.limitValue,
  expiresAt: organizationOverrides.expiresAt,
  clearedAt: organizationOverrides.clearedAt,
  reason: organizationOverrides.reason,
  trialId: organizationOverrides.trialId,
  createdAt: organizationOverrides.createdAt,
  byName: users.name,
}

type OverrideFacts = {
  id: string
  kind: 'release' | 'feature' | 'limit'
  key: string
  enabled: boolean | null
  limitValue: string | null
  expiresAt: Date | null
  reason: string
  trialId: string | null
  createdAt: Date
  byName: string | null
}

/** In the shared shape; keys the code no longer knows are left out (they don't apply). */
function toOverride(o: OverrideFacts): ConsoleOverride | null {
  const facts = {
    id: o.id,
    until: o.expiresAt ? o.expiresAt.toISOString() : null,
    reason: o.reason,
    byName: o.byName,
    at: o.createdAt.toISOString(),
    fromTrial: o.trialId !== null,
  }
  if (o.kind === 'limit') {
    return isLimitKey(o.key) ? { kind: 'limit', key: o.key, value: o.limitValue, ...facts } : null
  }
  return isFeatureKey(o.key)
    ? { kind: o.kind, key: o.key, enabled: o.enabled === true, ...facts }
    : null
}

const liveOverride = (now: Date) =>
  and(
    isNull(organizationOverrides.clearedAt),
    or(isNull(organizationOverrides.expiresAt), gt(organizationOverrides.expiresAt, now)),
  )
const endedOverride = (now: Date) =>
  or(isNotNull(organizationOverrides.clearedAt), lte(organizationOverrides.expiresAt, now))

export async function get(db: DbOrTx, id: string, now = new Date()): Promise<OrganizationDetail> {
  const org = await organizationRow(db, id)
  const [state, owner, planRow, trialRow, addOnRows, overrideRows, endedCount] = await runQueries(
    db,
    [
      () => organizationState(db, id, now),
      () => ownerOf(db, id),
      () =>
        db.execute<{
          key: string
          name: string
          version: number
          version_id: string
          latest: number
        }>(sql`
          select p.key, p.name, pv.version, pv.id as version_id,
            (select max(version) from plan_versions where plan_id = p.id)::int as latest
          from organization_plans op
          join plan_versions pv on pv.id = op.plan_version_id
          join plans p on p.id = pv.plan_id
          where op.organization_id = ${id}`),
      () =>
        db
          .select({
            id: organizationTrials.id,
            planKey: plans.key,
            planName: plans.name,
            endsOn: organizationTrials.endsOn,
            sevenDayReminderAt: organizationTrials.notifiedSevenDaysAt,
            oneDayReminderAt: organizationTrials.notifiedOneDayAt,
          })
          .from(organizationTrials)
          .innerJoin(planVersions, eq(planVersions.id, organizationTrials.planVersionId))
          .innerJoin(plans, eq(plans.id, planVersions.planId))
          .where(
            and(
              eq(organizationTrials.organizationId, id),
              isNull(organizationTrials.cancelledAt),
              gt(organizationTrials.expiresAt, now),
            ),
          )
          .limit(1),
      () =>
        db
          .select({
            id: organizationAddOns.id,
            key: organizationAddOns.addOnKey,
            limitIncreases: organizationAddOns.limitIncreases,
            since: organizationAddOns.startsAt,
          })
          .from(organizationAddOns)
          .where(
            and(
              eq(organizationAddOns.organizationId, id),
              isNull(organizationAddOns.cancelledAt),
              or(isNull(organizationAddOns.endsAt), gt(organizationAddOns.endsAt, now)),
            ),
          ),
      () =>
        db
          .select(OVERRIDE_COLUMNS)
          .from(organizationOverrides)
          .leftJoin(users, eq(users.id, organizationOverrides.createdByUserId))
          .where(and(eq(organizationOverrides.organizationId, id), liveOverride(now)))
          .orderBy(desc(organizationOverrides.createdAt)),
      () =>
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(organizationOverrides)
          .where(and(eq(organizationOverrides.organizationId, id), endedOverride(now))),
    ],
  )
  const availability = organizationAvailability(state.snapshot, state.plan, now)
  const plan = planRow.rows[0]
  const trial = trialRow[0]
  return {
    id: org.id,
    name: org.name,
    customerSince: org.createdAt.toISOString(),
    releaseGroup: state.plan.releaseGroup,
    owner,
    plan: plan
      ? {
          key: plan.key,
          name: plan.name,
          version: plan.version,
          versionId: plan.version_id,
          latestVersion: plan.latest,
        }
      : null,
    limits: await limitUses(db, availability),
    trial: trial
      ? {
          ...trial,
          sevenDayReminderAt: trial.sevenDayReminderAt?.toISOString() ?? null,
          oneDayReminderAt: trial.oneDayReminderAt?.toISOString() ?? null,
        }
      : null,
    addOns: addOnRows.flatMap((a) => {
      if (!isAddOnKey(a.key)) return []
      const budget = (a.limitIncreases as Record<string, unknown> | null)?.[ADD_ONS[a.key].limit]
      return [
        {
          id: a.id,
          key: a.key as AddOnKey,
          budget: new Decimal(String(budget ?? 0)).toFixed(2),
          since: a.since.toISOString(),
        },
      ]
    }),
    overrides: overrideRows.flatMap((o) => toOverride(o) ?? []),
    endedOverrideCount: endedCount[0]?.n ?? 0,
  }
}

/** Every catalog feature with why it is or isn't available: the Features card. */
export async function features(db: DbOrTx, id: string, now = new Date()): Promise<FeatureWhy[]> {
  await organizationRow(db, id)
  const [state, live] = await runQueries(db, [
    () => organizationState(db, id, now),
    () =>
      db
        .select({ id: organizationOverrides.id, key: organizationOverrides.key })
        .from(organizationOverrides)
        .where(and(eq(organizationOverrides.organizationId, id), liveOverride(now))),
  ])
  return FEATURE_KEYS.map((key) => ({
    key,
    label: featureLabel(key),
    module: key.split('.')[0] ?? key,
    ...explainFeature(state.snapshot, state.plan, key, now),
    overrideIds: live.filter((o) => o.key === key).map((o) => o.id),
  }))
}

/** The collapsed "3 ended" list, newest end first. */
export async function endedOverrides(
  db: DbOrTx,
  input: { id: string; page: number; pageSize: number },
  now = new Date(),
): Promise<{ items: EndedOverride[]; page: number; pageSize: number; total: number }> {
  await organizationRow(db, input.id)
  const { limit, offset } = pageOffset(input)
  const where = and(eq(organizationOverrides.organizationId, input.id), endedOverride(now))
  const endedAt = sql<Date>`coalesce(${organizationOverrides.clearedAt}, ${organizationOverrides.expiresAt})`
  const [rows, total] = await runQueries(db, [
    () =>
      db
        .select({ ...OVERRIDE_COLUMNS, endedAt })
        .from(organizationOverrides)
        .leftJoin(users, eq(users.id, organizationOverrides.createdByUserId))
        .where(where)
        .orderBy(desc(endedAt), desc(organizationOverrides.id))
        .limit(limit)
        .offset(offset),
    () => db.select({ n: sql<number>`count(*)::int` }).from(organizationOverrides).where(where),
  ])
  const items = rows.flatMap((r) => {
    const o = toOverride(r)
    return o ? [{ ...o, endedAt: new Date(r.endedAt).toISOString() } as EndedOverride] : []
  })
  return toPage(items, input, total[0]?.n ?? 0)
}

const ACCOUNT_ACTIVITY_DAYS = 30
const ACCOUNT_ACTIVITY_ROWS = 30

/**
 * Organization detail's Account activity card: "9 of 11 people active in the last 7 days · last
 * active today", then this organization's feed for 30 days. Internal organizations show theirs
 * too (the exclusion is for cross-customer numbers only).
 */
export async function accountActivity(
  db: DbOrTx,
  organizationId: string,
  now = new Date(),
): Promise<AccountActivity> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
  if (!org) throw notFound()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000)
  const [people, feed] = await runQueries(db, [
    () =>
      db.execute<{ people: number; active: number; last_active_at: Date | string | null }>(sql`
        select count(*)::int as people,
          (count(*) filter (where last_active_at >= ${weekAgo.toISOString()}::timestamptz))::int
            as active,
          max(last_active_at) as last_active_at
        from members where organization_id = ${organizationId}::uuid and status = 'active'`),
    () =>
      customerFeed(db, {
        organizationId,
        since: new Date(now.getTime() - ACCOUNT_ACTIVITY_DAYS * 24 * 60 * 60_000),
        limit: ACCOUNT_ACTIVITY_ROWS,
      }),
  ])
  const row = people.rows[0]
  return {
    people: Number(row?.people ?? 0),
    activeLast7Days: Number(row?.active ?? 0),
    lastActiveAt: row?.last_active_at ? new Date(row.last_active_at).toISOString() : null,
    feed,
  }
}
