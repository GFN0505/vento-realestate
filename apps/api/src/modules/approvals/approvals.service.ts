import {
  APPROVAL_ACTIONS,
  APPROVAL_COPY,
  type ApprovalRequestDetail,
  type ApprovalRequestRow,
  type ApprovalRequestStep,
  type ApprovalStatus,
  approvalSummary,
  type Currency,
  cancelledForLeaverText,
  formatAmount,
  hasPermission,
  isApprovalActionKey,
  type ListApprovalsOutput,
  type listApprovalsInput,
  matchRule,
  needsApprovalLine,
  noApproverMessage,
  type PreviewApprovalOutput,
  policySentence,
  type previewApprovalInput,
  ruleActionKey,
  staleMessage,
  stepText,
} from '@vento/shared'
import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ServiceContext } from '@/access/context'
import { whoCanGrant } from '@/access/who-can-grant'
import {
  CAN_DECIDE,
  chainGap,
  eligibleForRequest,
  OPEN_REQUEST,
  uuidArray,
  viewerStanding,
} from '@/approvals/eligibility'
import { expireOnRead, mayProceedWithoutApprover, pendingRequestId } from '@/approvals/engine'
import { approvalPlugins } from '@/approvals/registry'
import { loadRules, SYSTEM_ORDER } from '@/approvals/rules'
import type { DbOrTx } from '@/db/client'
import { rawTimestamp } from '@/db/raw'
import { runQueries } from '@/db/run-queries'
import { approvalDecisions, entities } from '@/db/schema'
import { forbidden, notFound } from '@/lib/errors'
import { pageOffset } from '@/lib/paginate'

// The Approvals inbox (spec: Approvals board). Every query filters to rows the viewer may see:
// eligible for the current step (Waiting for me), made by them (My requests), or decided by them
// (Decided). Nobody else's request is ever named, even by its id.

type ListInput = z.output<typeof listApprovalsInput>

type RowRecord = {
  id: string
  action_key: string
  summary: unknown
  amount: string | null
  currency: string | null
  ngn_amount: string | null
  maker_name: string
  reason: string
  status: ApprovalStatus
  ended_reason: ApprovalRequestRow['endedReason']
  current_step: number
  step_count: number
  entity_id: string | null
  entity_name: string | null
  created_at: Date | string
  decided_at: Date | string | null
}

const ROW_COLUMNS = sql`r.id, r.action_key, r.summary, r.amount, r.currency, r.ngn_amount,
  r.maker_name, r.reason, r.status, r.ended_reason, r.current_step, r.step_count, r.entity_id,
  e.name as entity_name, r.created_at, r.decided_at`

/** The viewer's company limits: organization-wide requests always, company ones inside them. */
function accessFilter(ctx: ServiceContext): SQL {
  if (ctx.member.entityIds === null) return sql``
  return sql` and (r.entity_id is null or r.entity_id = any(${uuidArray(ctx.member.entityIds)}))`
}

function tabFilter(ctx: ServiceContext, tab: ListInput['tab']): SQL {
  if (tab === 'waiting') return sql`${OPEN_REQUEST} and ${CAN_DECIDE}`
  if (tab === 'mine') return sql`r.maker_member_id = ${ctx.member.id}`
  return sql`exists (select 1 from approval_decisions d
    where d.request_id = r.id and d.user_id = ${ctx.user.id})`
}

function tabOrder(ctx: ServiceContext, tab: ListInput['tab']): SQL {
  // Oldest first while waiting, so nothing rots; newest first otherwise.
  if (tab === 'waiting') return sql`r.created_at asc, r.id asc`
  if (tab === 'mine') return sql`r.created_at desc, r.id desc`
  return sql`(select max(d.created_at) from approval_decisions d
    where d.request_id = r.id and d.user_id = ${ctx.user.id}) desc, r.id desc`
}

/** A company outside the viewer's access, or not this organization's: the list is empty. */
async function entityVisible(ctx: ServiceContext, entityId: string): Promise<boolean> {
  if (ctx.member.entityIds !== null && !ctx.member.entityIds.includes(entityId)) return false
  const [row] = await ctx.db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.organizationId, ctx.organizationId), eq(entities.id, entityId)))
  return Boolean(row)
}

export async function listApprovals(
  ctx: ServiceContext,
  input: ListInput,
): Promise<ListApprovalsOutput> {
  await expireOnRead(ctx.db, ctx.organizationId)
  const waitingCount = await countWaiting(ctx.db, ctx)
  const empty = { items: [], page: input.page, pageSize: input.pageSize, total: 0, waitingCount }
  if (input.entityId && !(await entityVisible(ctx, input.entityId))) return empty
  // The company switcher (decision 0014): its own requests, and organization-wide ones, which
  // belong to every company view.
  const company = input.entityId
    ? sql` and (r.entity_id is null or r.entity_id = ${input.entityId})`
    : sql``
  const where = sql`r.organization_id = ${ctx.organizationId} and ${tabFilter(ctx, input.tab)}${accessFilter(ctx)}${company}`
  const from = sql`from approval_requests r
    left join members m on m.id = ${ctx.member.id} and m.organization_id = r.organization_id
    left join entities e on e.id = r.entity_id and e.organization_id = r.organization_id`
  const { limit, offset } = pageOffset(input)
  const [page, count] = await runQueries(ctx.db, [
    () =>
      ctx.db.execute<RowRecord>(sql`
        select ${ROW_COLUMNS} ${from} where ${where}
        order by ${tabOrder(ctx, input.tab)} limit ${limit} offset ${offset}`),
    () => ctx.db.execute<{ n: number }>(sql`select count(*)::int as n ${from} where ${where}`),
  ])
  const items = await toRows(ctx.db, page.rows)
  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total: count.rows[0]?.n ?? 0,
    waitingCount,
  }
}

/** The top bar's count: requests whose current step the viewer can decide now. */
export async function countWaiting(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from approval_requests r
    join members m on m.id = ${ctx.member.id} and m.organization_id = r.organization_id
    where r.organization_id = ${ctx.organizationId} and ${OPEN_REQUEST} and ${CAN_DECIDE}`)
  return result.rows[0]?.n ?? 0
}

/** Made a request in the last 90 days: the inbox stays visible to makers without Approve. */
export async function madeRecentRequest(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
): Promise<boolean> {
  const result = await db.execute<{ yes: boolean }>(sql`
    select exists (select 1 from approval_requests r
      where r.organization_id = ${ctx.organizationId} and r.maker_member_id = ${ctx.member.id}
        and r.created_at > now() - interval '90 days') as yes`)
  return Boolean(result.rows[0]?.yes)
}

type StepRoleRow = { request_id: string; position: number; name: string }

/** Every step's roles for these requests, system roles first, then A–Z. */
async function stepRoles(db: DbOrTx, ids: readonly string[]): Promise<StepRoleRow[]> {
  if (ids.length === 0) return []
  const result = await db.execute<StepRoleRow>(sql`
    select sr.request_id, sr.position, ro.name
    from approval_request_step_roles sr
    join roles ro on ro.id = sr.role_id and ro.organization_id = sr.organization_id
    where sr.request_id = any(${uuidArray(ids)})
    order by sr.request_id, sr.position, array_position(${SYSTEM_ORDER}, ro.key) nulls last,
      lower(ro.name)`)
  return result.rows
}

function stepTexts(rows: readonly StepRoleRow[], requestId: string): Map<number, string> {
  const names = new Map<number, string[]>()
  for (const row of rows) {
    if (row.request_id !== requestId) continue
    names.set(row.position, [...(names.get(row.position) ?? []), row.name])
  }
  return new Map([...names].map(([position, list]) => [position, stepText(list)]))
}

type LastDecision = {
  request_id: string
  member_name: string
  decision: 'approve' | 'reject'
  comment: string | null
}

async function lastDecisions(
  db: DbOrTx,
  ids: readonly string[],
): Promise<Map<string, LastDecision>> {
  if (ids.length === 0) return new Map()
  const result = await db.execute<LastDecision>(sql`
    select distinct on (request_id) request_id, member_name, decision, comment
    from approval_decisions where request_id = any(${uuidArray(ids)})
    order by request_id, position desc`)
  return new Map(result.rows.map((r) => [r.request_id, r]))
}

function amountOf(row: Pick<RowRecord, 'amount' | 'currency' | 'ngn_amount'>) {
  if (row.amount === null || row.currency === null || row.ngn_amount === null) return null
  return { value: row.amount, currency: row.currency as Currency, ngnValue: row.ngn_amount }
}

/** List rows in three queries whatever the page size: the page, its step roles, its decisions. */
async function toRows(db: DbOrTx, records: readonly RowRecord[]): Promise<ApprovalRequestRow[]> {
  const ids = records.map((r) => r.id)
  const [roles, decisions] = await runQueries(db, [
    () => stepRoles(db, ids),
    () => lastDecisions(db, ids),
  ])
  return records.flatMap((r) => {
    if (!isApprovalActionKey(r.action_key)) return []
    const summary = approvalSummary.parse(r.summary)
    const last = decisions.get(r.id)
    return [
      {
        id: r.id,
        actionKey: r.action_key,
        chip: APPROVAL_ACTIONS[r.action_key].chip,
        title: summary.title,
        amount: amountOf(r),
        makerName: r.maker_name,
        reason: r.reason,
        status: r.status,
        endedReason: r.ended_reason,
        currentStep: r.current_step,
        stepCount: r.step_count,
        waitingFor:
          r.status === 'pending' ? (stepTexts(roles, r.id).get(r.current_step) ?? null) : null,
        lastDecision: last
          ? { name: last.member_name, decision: last.decision, comment: last.comment }
          : null,
        entity: r.entity_id && r.entity_name ? { id: r.entity_id, name: r.entity_name } : null,
        createdAt: (rawTimestamp(r.created_at) ?? new Date(0)).toISOString(),
        decidedAt: rawTimestamp(r.decided_at)?.toISOString() ?? null,
      },
    ]
  })
}

const EARLIER_STEP =
  'You approved an earlier step of this request, so someone else approves this one.'

/**
 * The detail: visible to the maker, the people who decided it, and the people whose role is in
 * its current step (an excluded one sees why they can't decide). Anyone else: not found.
 */
export async function getApproval(ctx: ServiceContext, id: string): Promise<ApprovalRequestDetail> {
  await expireOnRead(ctx.db, ctx.organizationId)
  const standing = await viewerStanding(ctx.db, ctx.organizationId, id, {
    memberId: ctx.member.id,
    userId: ctx.user.id,
  })
  if (!standing || !(standing.isMaker || standing.couldApprove || standing.decided)) {
    throw notFound()
  }
  const result = await ctx.db.execute<
    RowRecord & {
      module: ApprovalRequestDetail['module']
      policy: string
      expires_at: Date | string
      exclusions: { userId: string; reason: string }[]
    }
  >(sql`
    select ${ROW_COLUMNS}, r.module, r.policy, r.expires_at, r.exclusions
    from approval_requests r
    left join entities e on e.id = r.entity_id and e.organization_id = r.organization_id
    where r.organization_id = ${ctx.organizationId} and r.id = ${id}${accessFilter(ctx)}`)
  const record = result.rows[0]
  if (!record || !isApprovalActionKey(record.action_key)) throw notFound()
  const [row] = await toRows(ctx.db, [record])
  if (!row) throw notFound()
  const summary = approvalSummary.parse(record.summary)
  const meta = APPROVAL_ACTIONS[record.action_key]
  const pending = record.status === 'pending'
  const canDecide =
    pending && !standing.isMaker && standing.couldApprove && !standing.excluded && !standing.decided
  const roles = await stepRoles(ctx.db, [id])
  const decisions = await ctx.db
    .select()
    .from(approvalDecisions)
    .where(
      and(
        eq(approvalDecisions.organizationId, ctx.organizationId),
        eq(approvalDecisions.requestId, id),
      ),
    )
    .orderBy(approvalDecisions.position)
  const texts = stepTexts(roles, id)
  const steps: ApprovalRequestStep[] = Array.from({ length: record.step_count }, (_, i) => {
    const position = i + 1
    const decision = decisions.find((d) => d.position === position)
    return {
      position,
      text: texts.get(position) ?? '',
      state: decision
        ? decision.decision === 'approve'
          ? 'approved'
          : 'rejected'
        : !pending
          ? 'not_reached'
          : position === record.current_step
            ? 'waiting'
            : 'upcoming',
      decision: decision
        ? {
            memberName: decision.memberName,
            decision: decision.decision,
            comment: decision.comment,
            decidedAt: decision.createdAt.toISOString(),
          }
        : null,
      isYou: canDecide && position === record.current_step,
    }
  })
  const exclusion = record.exclusions.find((e) => e.userId === ctx.user.id)
  return {
    ...row,
    module: record.module,
    summary,
    policy: record.policy,
    steps,
    approveLabel: meta.approveLabel({
      title: summary.title,
      recordLabel: summary.recordLabel,
      amountText: summary.amount
        ? formatAmount(summary.amount.value, summary.amount.currency)
        : null,
    }),
    irreversible: meta.irreversible,
    isOwn: standing.isMaker,
    canDecide,
    blockedReason:
      pending && !standing.isMaker && !canDecide
        ? standing.decided
          ? EARLIER_STEP
          : (exclusion?.reason ?? null)
        : null,
    canCancel: standing.isMaker && pending,
    reviewerHint:
      standing.isMaker && pending
        ? await reviewerHint(ctx.db, ctx.organizationId, id, texts.get(record.current_step))
        : null,
    endedNote: endedNote(
      record.status,
      record.ended_reason,
      summary.recordLabel,
      record.maker_name,
    ),
    expiresAt: (rawTimestamp(record.expires_at) ?? new Date(0)).toISOString(),
  }
}

/** The own-request note: "Aisha Bello (Finance) will review it." */
async function reviewerHint(
  db: DbOrTx,
  organizationId: string,
  requestId: string,
  stepWords: string | undefined,
): Promise<string> {
  const people = await eligibleForRequest(db, organizationId, requestId, 3)
  const named = people.map((p) => `${p.name} (${p.roleName})`)
  if (people.length === 1) return `${named[0]} will review it.`
  if (people.length === 2) return `${named[0]} or ${named[1]} will review it.`
  return `Someone with the ${stepWords ?? 'approver'} role will review it.`
}

function endedNote(
  status: ApprovalStatus,
  reason: RowRecord['ended_reason'],
  recordLabel: string,
  makerName: string,
): string | null {
  if (status === 'expired')
    return reason === 'stale' ? staleMessage(recordLabel) : APPROVAL_COPY.expired
  if (status === 'cancelled') {
    return reason === 'maker_left' ? cancelledForLeaverText(makerName) : `Cancelled by ${makerName}`
  }
  return null
}

/**
 * Whether a guarded action on this record would need approval, and by whom. Only for people who
 * may take the action (security M4): the chain names roles and the pending request's id, and the
 * web only asks when the viewer can make the change.
 */
export async function previewApproval(
  ctx: ServiceContext,
  input: z.output<typeof previewApprovalInput>,
): Promise<PreviewApprovalOutput> {
  const plugin = approvalPlugins()[input.actionKey]
  const { module, action } = plugin.permission
  if (!hasPermission(ctx.member.permissions, module, action)) {
    const advice = await whoCanGrant(ctx.db, {
      organizationId: ctx.organizationId,
      module,
      action,
      doing: lowerFirst(APPROVAL_ACTIONS[input.actionKey].label),
      excludeUserId: ctx.user.id,
    })
    throw forbidden('permission', advice.message)
  }
  if (!(await plugin.appliesTo(ctx.db, ctx, input.subject))) return { needed: false }
  const rules = await loadRules(ctx.db, ctx.organizationId, ruleActionKey(input.actionKey))
  const entityId = input.entityId ?? null
  const rule = matchRule(rules, {
    actionKey: input.actionKey,
    entityId,
    ngnAmount: input.ngnAmount ?? null,
  })
  if (!rule) return { needed: false }
  const stepWords = rule.steps.map((step) => stepText(step.map((r) => r.name)))
  const meta = APPROVAL_ACTIONS[input.actionKey]
  // The same test requestOrRun applies, without the record's own exclusions (no payload here).
  let blocked: string | null = null
  if (!(await mayProceedWithoutApprover(ctx.db, ctx, input.actionKey))) {
    const gap = await chainGap(
      ctx.db,
      ctx.organizationId,
      {
        steps: rule.steps.map((step) => step.map((r) => r.id)),
        module: meta.module,
        entityId,
        makerUserId: ctx.user.id,
      },
      [],
    )
    if (gap !== null) blocked = noApproverMessage(await entityName(ctx, entityId))
  }
  return {
    needed: true,
    chain: needsApprovalLine(stepWords),
    policy: policySentence({
      actionKey: input.actionKey,
      minAmount: rule.minAmount,
      stepTexts: stepWords,
      entityNames: rule.entities === 'all' ? 'all' : rule.entities.map((e) => e.name),
    }),
    blocked,
    pendingRequestId: await pendingRequestId(
      ctx.db,
      ctx.organizationId,
      input.actionKey,
      input.subject,
    ),
  }
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

async function entityName(ctx: ServiceContext, entityId: string | null): Promise<string | null> {
  if (entityId === null) return null
  const [row] = await ctx.db
    .select({ name: entities.name })
    .from(entities)
    .where(and(eq(entities.organizationId, ctx.organizationId), eq(entities.id, entityId)))
  return row?.name ?? null
}
