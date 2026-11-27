import {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_MODULE_LABELS,
  type AuditDetail,
  type AuditPerson,
  type AuditRow,
  auditActionsInModule,
  auditActionsMatching,
  auditFieldChanges,
  type auditFilters,
  auditModuleOf,
  type auditPeopleInput,
  auditWhat,
  type listAuditInput,
  OTHER_ORGANIZATION_ACTOR,
  tooManyRowsMessage,
} from '@vento/shared'
import { and, desc, eq, gte, ilike, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { SYSTEM_ACTOR } from '@/approvals/engine'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { approvalDecisions, auditEvents } from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import { likePattern } from '@/lib/like'
import { pageOffset } from '@/lib/paginate'
import { ORGANIZATION_NOTICE_ACTOR } from '@/platform/platform-audit'
import { recordAudit } from './audit.service'
import { toCsv } from './csv'

// Settings → Audit log (AuditLog board): the existing append-only audit table, read in plain
// words. Every query is bounded by a date range of at most a year (plan question 8), so it uses
// audit_events_org_created_idx. Raw JSON never leaves the API: before → after is built here from
// the shared field labels.

type Filters = z.output<typeof auditFilters>

const DAY_MS = 86_400_000

/** Calendar dates in Lagos (UTC+1 all year) to a UTC range, `to` inclusive. */
export function dateRange(from: string, to: string): { start: Date; end: Date } {
  const start = new Date(`${from}T00:00:00+01:00`)
  const end = new Date(new Date(`${to}T00:00:00+01:00`).getTime() + DAY_MS)
  return { start, end }
}

/**
 * Whether the actor is someone this organization knows: no person (a job, Vento Real Estate's
 * notices, an invitee), or a member here now or before. Account events are copied into every
 * organization the person belongs to (recordAccountEvent), so an admin of another organization
 * can be the actor of a row here (security L1).
 */
const ACTOR_KNOWN_HERE = sql`(${auditEvents.actorUserId} is null or exists (
  select 1 from members m
  where m.organization_id = ${auditEvents.organizationId} and m.user_id = ${auditEvents.actorUserId}))`

/** member: show as recorded; staff: Vento Real Estate; other: an admin of another organization. */
const ACTOR_STANDING = sql<ActorStanding>`case
  when ${ACTOR_KNOWN_HERE} then 'member'
  when exists (select 1 from users u
    where u.id = ${auditEvents.actorUserId} and u.account_kind = 'staff') then 'staff'
  else 'other' end`

type ActorStanding = 'member' | 'staff' | 'other'

function conditions(ctx: ServiceContext, f: Filters): SQL | undefined {
  const { start, end } = dateRange(f.from, f.to)
  const parts: (SQL | undefined)[] = [
    eq(auditEvents.organizationId, ctx.organizationId),
    gte(auditEvents.createdAt, start),
    lt(auditEvents.createdAt, end),
  ]
  if (f.module) {
    const actions = auditActionsInModule(f.module)
    parts.push(actions.length ? inArray(auditEvents.action, actions) : sql`false`)
  }
  if (f.actorUserId) parts.push(eq(auditEvents.actorUserId, f.actorUserId))
  if (f.entityId) {
    parts.push(
      or(
        and(eq(auditEvents.targetType, 'entity'), eq(auditEvents.targetId, f.entityId)),
        sql`${auditEvents.metadata}->>'entityId' = ${f.entityId}`,
      ),
    )
  }
  if (f.targetType) parts.push(eq(auditEvents.targetType, f.targetType))
  if (f.targetId) parts.push(eq(auditEvents.targetId, f.targetId))
  if (f.q) {
    const pattern = likePattern(f.q)
    const actions = auditActionsMatching(f.q)
    parts.push(
      or(
        // Never by the name of someone who isn't shown here.
        and(ilike(auditEvents.actorName, pattern), ACTOR_KNOWN_HERE),
        ilike(auditEvents.targetLabel, pattern),
        actions.length ? inArray(auditEvents.action, actions) : undefined,
      ),
    )
  }
  return and(...parts)
}

const COLUMNS = {
  id: auditEvents.id,
  at: auditEvents.createdAt,
  actorUserId: auditEvents.actorUserId,
  actorName: auditEvents.actorName,
  action: auditEvents.action,
  targetType: auditEvents.targetType,
  targetId: auditEvents.targetId,
  targetLabel: auditEvents.targetLabel,
  before: auditEvents.before,
  after: auditEvents.after,
  metadata: auditEvents.metadata,
  userAgentSummary: auditEvents.userAgentSummary,
  ipMasked: auditEvents.ipMasked,
  actorStanding: ACTOR_STANDING,
}

type EventRow = {
  id: string
  at: Date
  actorUserId: string | null
  actorName: string
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  before: unknown
  after: unknown
  metadata: unknown
  userAgentSummary: string | null
  ipMasked: string | null
  actorStanding: ActorStanding
}

type Json = Record<string, unknown> | null

const asJson = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/**
 * A person; "System" for jobs (approvals expiry); anything else without a person is Vento Real
 * Estate's platform changes (ORGANIZATION_NOTICE_ACTOR, and its older name on rows from before 1b).
 */
function actorKind(row: Pick<EventRow, 'actorUserId' | 'actorName'>): AuditRow['actor']['kind'] {
  if (row.actorUserId) return 'person'
  return row.actorName === SYSTEM_ACTOR.name ? 'system' : 'vento'
}

/**
 * Who, as this organization may see them. Someone outside it is never named, and their device
 * and IP address are dropped: they belong to another organization's admin, or to Vento Real
 * Estate's staff.
 */
function whoOf(row: EventRow): Pick<AuditRow, 'actor' | 'device' | 'ipMasked'> {
  if (row.actorStanding === 'staff') {
    return {
      actor: { userId: null, name: ORGANIZATION_NOTICE_ACTOR, kind: 'vento' },
      device: null,
      ipMasked: null,
    }
  }
  if (row.actorStanding === 'other') {
    return {
      actor: { userId: null, name: OTHER_ORGANIZATION_ACTOR, kind: 'other_organization' },
      device: null,
      ipMasked: null,
    }
  }
  return {
    actor: { userId: row.actorUserId, name: row.actorName, kind: actorKind(row) },
    device: row.userAgentSummary,
    ipMasked: row.ipMasked,
  }
}

function toRow(row: EventRow): AuditRow {
  const metadata = asJson(row.metadata)
  const who = whoOf(row)
  return {
    id: row.id,
    at: row.at.toISOString(),
    actor: who.actor,
    module: auditModuleOf(row.action) ?? 'settings',
    what: auditWhat(row.action, { targetLabel: row.targetLabel, metadata }),
    changes: auditFieldChanges(asJson(row.before), asJson(row.after)),
    device: who.device,
    ipMasked: who.ipMasked,
  }
}

export async function listAudit(
  ctx: ServiceContext,
  input: z.output<typeof listAuditInput>,
): Promise<{ items: AuditRow[]; page: number; pageSize: number; total: number }> {
  const where = conditions(ctx, input)
  const { limit, offset } = pageOffset(input)
  const [rows, [count]] = await runQueries(ctx.db, [
    () =>
      ctx.db
        .select(COLUMNS)
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(limit)
        .offset(offset),
    () => ctx.db.select({ n: sql<number>`count(*)::int` }).from(auditEvents).where(where),
  ])
  return {
    items: rows.map(toRow),
    page: input.page,
    pageSize: input.pageSize,
    total: count?.n ?? 0,
  }
}

/** The Person filter's input: dates, part of a name, and a page. */
type PeopleInput = z.output<typeof auditPeopleInput>

/**
 * The Person filter's choices (review S3): members, removed ones included, who acted in the log
 * in these dates. Starts from the organization's members, so it's bounded by them, and each check
 * is one probe of audit_events_org_actor_idx. Nobody outside the organization is listed.
 */
export async function listAuditPeople(
  ctx: ServiceContext,
  input: PeopleInput,
): Promise<{ items: AuditPerson[]; page: number; pageSize: number; total: number }> {
  const { start, end } = dateRange(input.from, input.to)
  const { limit, offset } = pageOffset(input)
  const named = input.q ? sql`and u.name ilike ${likePattern(input.q)}` : sql``
  const result = await ctx.db.execute<{
    user_id: string
    name: string
    removed: boolean
    total: number
  }>(sql`
    select u.id as user_id, u.name, bool_and(m.status = 'removed') as removed,
      count(*) over ()::int as total
    from members m
    join users u on u.id = m.user_id
    where m.organization_id = ${ctx.organizationId} ${named}
      and exists (
        select 1 from audit_events a
        where a.organization_id = m.organization_id and a.actor_user_id = m.user_id
          and a.created_at >= ${start} and a.created_at < ${end})
    group by u.id, u.name
    order by lower(u.name), u.id
    limit ${limit} offset ${offset}
  `)
  return {
    items: result.rows.map((r) => ({ userId: r.user_id, name: r.name, removed: r.removed })),
    page: input.page,
    pageSize: input.pageSize,
    total: result.rows[0]?.total ?? (offset > 0 ? await countPeople(ctx, input) : 0),
  }
}

/** The total when the page asked for is past the end (the window count has no row to ride on). */
async function countPeople(ctx: ServiceContext, input: PeopleInput): Promise<number> {
  return (await listAuditPeople(ctx, { ...input, page: 1, pageSize: 1 })).total
}

/** The app page for an entry's record, when it has one. */
function recordLink(targetType: string, targetId: string | null): string | null {
  switch (targetType) {
    case 'role':
      return targetId ? `/settings/roles/${targetId}` : null
    case 'member':
    case 'invitation':
      return '/settings/team'
    case 'entity':
      return '/settings/companies'
    case 'organization':
      return '/settings/organization'
    case 'approval_rule':
      return '/settings/approval-rules'
    default:
      return null
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The entry sheet: every field, the approvals behind the change, and a link to the record. */
export async function getAudit(ctx: ServiceContext, id: string): Promise<AuditDetail> {
  const [row] = await ctx.db
    .select(COLUMNS)
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, ctx.organizationId), eq(auditEvents.id, id)))
  if (!row) throw notFound()
  const metadata = asJson(row.metadata)
  const requestId =
    typeof metadata?.approvalRequestId === 'string' && UUID.test(metadata.approvalRequestId)
      ? metadata.approvalRequestId
      : null
  const approvedBy = requestId
    ? await ctx.db
        .select({ name: approvalDecisions.memberName, position: approvalDecisions.position })
        .from(approvalDecisions)
        .where(
          and(
            eq(approvalDecisions.organizationId, ctx.organizationId),
            eq(approvalDecisions.requestId, requestId),
            eq(approvalDecisions.decision, 'approve'),
          ),
        )
        .orderBy(approvalDecisions.position)
    : []
  return {
    ...toRow(row),
    record: row.targetLabel
      ? { label: row.targetLabel, link: recordLink(row.targetType, row.targetId) }
      : null,
    approvedBy,
    noApprover: metadata?.noApprover === true,
    approvalRequestId: requestId,
  }
}

const EXPORT_PAGE = 1_000

const CSV_HEADER = ['When', 'Who', 'Module', 'What', 'Changes', 'Device', 'IP address'] as const

function csvRow(row: AuditRow): string[] {
  const at = new Date(row.at)
  return [
    `${formatDate(at)} ${formatTime(at)}`,
    row.actor.name,
    AUDIT_MODULE_LABELS[row.module],
    row.what,
    row.changes
      .map((c) =>
        c.before === null && c.after === null
          ? c.label
          : `${c.label}: ${c.before ?? '—'} → ${c.after ?? '—'}`,
      )
      .join('; '),
    row.device ?? '',
    row.ipMasked ?? '',
  ]
}

/**
 * The filtered rows as CSV, newest first, up to 50,000; above that, CONFLICT `too_many_rows` with
 * the count ("Narrow the dates to export."). Read in keyset pages of 1,000. The export is itself
 * an audit entry, with its filters and count.
 */
export async function exportAudit(ctx: ServiceContext, input: Filters): Promise<File> {
  const where = conditions(ctx, input)
  const [count] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(where)
  const total = count?.n ?? 0
  if (total > AUDIT_EXPORT_MAX_ROWS) {
    throw conflict('too_many_rows', tooManyRowsMessage(total), { count: total })
  }
  const lines: string[][] = []
  let after: { at: Date; id: string } | null = null
  for (;;) {
    const page: EventRow[] = await ctx.db
      .select(COLUMNS)
      .from(auditEvents)
      .where(
        and(
          where,
          after
            ? sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (${after.at}, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(EXPORT_PAGE)
    for (const row of page) lines.push(csvRow(toRow(row)))
    const last = page.at(-1)
    if (page.length < EXPORT_PAGE || !last || lines.length >= AUDIT_EXPORT_MAX_ROWS) break
    after = { at: last.at, id: last.id }
  }
  await recordExport(ctx.db, ctx, input, lines.length)
  return new File([toCsv(CSV_HEADER, lines)], `audit-log-${input.from}-to-${input.to}.csv`, {
    type: 'text/csv;charset=utf-8',
  })
}

async function recordExport(db: DbOrTx, ctx: ServiceContext, f: Filters, n: number) {
  await recordAudit(db, {
    organizationId: ctx.organizationId,
    action: 'audit.exported',
    actor: actorOf(ctx),
    target: { type: 'organization', id: ctx.organizationId, label: ctx.organizationName },
    metadata: {
      count: n,
      filters: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)),
    },
  })
}
