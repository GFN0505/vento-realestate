import { ORPCError } from '@orpc/server'
import {
  APPROVAL_ACTIONS,
  APPROVAL_COPY,
  type ApprovalActionKey,
  type ApprovalSummary,
  approvalSummary,
  cancelledForLeaverText,
  type decideInput,
  hasPermission,
  isApprovalActionKey,
  joinNames,
  matchRule,
  policySentence,
  ruleActionKey,
  stepText,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { loadMembership, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import {
  approvalDecisions,
  approvalRequestStepRoles,
  approvalRequests,
  entities,
  users,
} from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { isUniqueViolation, notFound } from '@/lib/errors'
import { type AuditActor, recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'
import {
  countEligibleDraft,
  draftTarget,
  type EligiblePerson,
  eligibleForRequest,
  viewerStanding,
} from './eligibility'
import { approvalDecidedMessage, approvalNeededMessages } from './emails'
import {
  alreadyPending,
  decidedMomentAgo,
  noApprover,
  notEligible,
  notPending,
  ownRequest,
  reasonRequired,
  requestExpired,
  requestStale,
  StaleError,
} from './errors'
import {
  type AfterCommitDeps,
  type ApprovalPlugin,
  type Approver,
  type ExecuteResult,
  RAN_AT_ONCE,
  type RegisteredPlugin,
} from './plugin'
import { loadRules, SYSTEM_ORDER } from './rules'

/** Pending requests expire after 7 days without a decision (spec open question 5). */
export const APPROVAL_TTL_MS = 7 * 24 * 3600_000

/** The audit actor for expiry: a job, not a person. */
export const SYSTEM_ACTOR: AuditActor = { userId: null, name: 'System' }

export type RequestOrRunResult<R extends ExecuteResult> =
  | { ran: true; result: R }
  | { ran: false; requestId: string; notice: string; emails: EmailMessage[] }

type RequestRow = typeof approvalRequests.$inferSelect

/**
 * The one call a guarded action makes (decision 0024), inside the caller's transaction. No rule:
 * the action runs at once, as before brick 4. A rule: a request is saved with the rule's steps
 * copied, and nothing else changes until the last approval. Nobody else can approve: the
 * catalog decides between going ahead (marked in the audit) and refusing before anything is saved.
 */
export async function requestOrRun<P, R extends ExecuteResult>(
  tx: DbOrTx,
  ctx: ServiceContext,
  plugin: ApprovalPlugin<P, R>,
  input: { payload: P; reason?: string | null },
): Promise<RequestOrRunResult<R>> {
  const payload = plugin.payload.parse(input.payload)
  const meta = APPROVAL_ACTIONS[plugin.key]
  const described = await plugin.describe(tx, ctx, payload)
  const amount = described.summary.amount
  const rules = await loadRules(tx, ctx.organizationId, ruleActionKey(plugin.key))
  const rule = matchRule(rules, {
    actionKey: plugin.key,
    entityId: described.entityId,
    ngnAmount: amount?.ngnValue ?? null,
  })
  if (!rule) return { ran: true, result: await plugin.execute(tx, ctx, payload, RAN_AT_ONCE) }

  const reason = input.reason?.trim()
  if (!reason) throw reasonRequired()
  const exclusions = await plugin.excluded(tx, ctx, payload)
  const firstStep = rule.steps[0] ?? []
  const eligible = await countEligibleDraft(
    tx,
    ctx.organizationId,
    draftTarget({
      roleIds: firstStep.map((r) => r.id),
      module: meta.module,
      entityId: described.entityId,
      makerUserId: ctx.user.id,
    }),
    exclusions.map((e) => e.userId),
  )
  if (eligible === 0) {
    if (meta.whenNoApprover === 'refuse') {
      throw noApprover(await entityName(tx, ctx.organizationId, described.entityId))
    }
    const result = await plugin.execute(tx, ctx, payload, {
      approvedBy: [],
      approvalRequestId: null,
      noApprover: true,
    })
    return { ran: true, result }
  }

  const subject = plugin.subject(payload)
  const pending = await pendingRequestId(tx, ctx.organizationId, plugin.key, subject)
  if (pending) throw alreadyPending(pending)
  const policy = policySentence({
    actionKey: plugin.key,
    minAmount: rule.minAmount,
    stepTexts: rule.steps.map((step) => stepText(step.map((r) => r.name))),
    entityNames: rule.entities === 'all' ? 'all' : rule.entities.map((e) => e.name),
  })
  const requestId = await insertRequest(tx, {
    organizationId: ctx.organizationId,
    actionKey: plugin.key,
    module: meta.module,
    entityId: described.entityId,
    subjectType: subject.type,
    subjectId: subject.id,
    payload,
    summary: described.summary,
    reason,
    makerMemberId: ctx.member.id,
    makerUserId: ctx.user.id,
    makerName: ctx.user.name,
    stepCount: rule.steps.length,
    ruleId: rule.id,
    policy,
    excludedUserIds: exclusions.map((e) => e.userId),
    exclusions,
    amount: amount?.value ?? null,
    currency: amount?.currency ?? null,
    ngnAmount: amount?.ngnValue ?? null,
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
  })
  await tx.insert(approvalRequestStepRoles).values(
    rule.steps.flatMap((step, i) =>
      step.map((role) => ({
        organizationId: ctx.organizationId,
        requestId,
        position: i + 1,
        roleId: role.id,
      })),
    ),
  )
  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    action: 'approval.requested',
    actor: { userId: ctx.user.id, name: ctx.user.name },
    target: { type: subject.type, id: subject.id, label: described.summary.title },
    metadata: {
      approvalRequestId: requestId,
      actionKey: plugin.key,
      module: meta.module,
      entityId: described.entityId,
      reason,
      policy,
    },
  })
  const approvers = await eligibleForRequest(tx, ctx.organizationId, requestId)
  const emails = approvalNeededMessages({
    organizationName: ctx.organizationName,
    requestId,
    makerName: ctx.user.name,
    summary: described.summary,
    reason,
    approvedSoFar: [],
    to: approvers,
  })
  const firstText = stepText(firstStep.map((r) => r.name))
  return { ran: false, requestId, notice: sentNotice(approvers, firstText), emails }
}

/** "Sent to Aisha Bello for approval", or the step's roles when many people can approve it. */
function sentNotice(approvers: readonly EligiblePerson[], stepWords: string): string {
  if (approvers.length > 0 && approvers.length <= 2) {
    return `Sent to ${joinNames(approvers.map((a) => a.name))} for approval`
  }
  return `Sent to ${stepWords} for approval`
}

async function entityName(
  db: DbOrTx,
  organizationId: string,
  entityId: string | null,
): Promise<string | null> {
  if (entityId === null) return null
  const [row] = await db
    .select({ name: entities.name })
    .from(entities)
    .where(and(eq(entities.organizationId, organizationId), eq(entities.id, entityId)))
  return row?.name ?? null
}

/** The pending request for this record and action, if any. */
export async function pendingRequestId(
  db: DbOrTx,
  organizationId: string,
  actionKey: ApprovalActionKey,
  subject: { type: string; id: string },
): Promise<string | null> {
  const [row] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.actionKey, actionKey),
        eq(approvalRequests.subjectType, subject.type),
        eq(approvalRequests.subjectId, subject.id),
        eq(approvalRequests.status, 'pending'),
      ),
    )
  return row?.id ?? null
}

/**
 * Two makers racing past the pending check: the partial unique index decides, inside a savepoint
 * so the loser's transaction can still read the winner's id.
 */
async function insertRequest(
  tx: DbOrTx,
  values: typeof approvalRequests.$inferInsert,
): Promise<string> {
  try {
    return await tx.transaction(async (sp) => {
      const [row] = await sp
        .insert(approvalRequests)
        .values(values)
        .returning({ id: approvalRequests.id })
      if (!row) throw new Error('Approval request insert returned nothing')
      return row.id
    })
  } catch (error) {
    if (!isUniqueViolation(error, 'approval_requests_pending_subject_unique')) throw error
    const winner = await pendingRequestId(
      tx,
      values.organizationId,
      values.actionKey as ApprovalActionKey,
      {
        type: values.subjectType,
        id: values.subjectId,
      },
    )
    throw alreadyPending(winner ?? '')
  }
}

// ---------------------------------------------------------------------------------------------
// Deciding

export type DecideResult = {
  notice: string
  ran: boolean
  emails: EmailMessage[]
  afterCommit: ((deps: AfterCommitDeps) => Promise<void>) | null
}

/** The action's own checks refused when it was about to run: the request is out of date. */
class ExecuteRefused extends Error {
  constructor(readonly recordLabel: string) {
    super('Approved action refused at execution')
  }
}

type Registry = Readonly<Record<ApprovalActionKey, RegisteredPlugin>>

/**
 * Approve or reject the current step, in one transaction: lock, re-check eligibility against the
 * member as they are now, record the decision, then reject, move on, or run the action as the
 * maker. If the action refuses now, everything rolls back and the request expires as stale in a
 * second short transaction.
 */
export async function decide(
  ctx: ServiceContext,
  input: z.output<typeof decideInput>,
  registry: Registry,
): Promise<DecideResult> {
  try {
    const outcome = await ctx.db.transaction(async (tx) => decideInTx(tx, ctx, input, registry))
    if (outcome === 'expired') throw requestExpired()
    return outcome
  } catch (error) {
    if (!(error instanceof ExecuteRefused)) throw error
    await ctx.db.transaction(async (tx) => {
      const request = await lockRequest(tx, ctx.organizationId, input.requestId)
      if (request?.status === 'pending')
        await endRequest(tx, request, 'expired', 'stale', SYSTEM_ACTOR)
    })
    throw requestStale(error.recordLabel)
  }
}

async function decideInTx(
  tx: DbOrTx,
  ctx: ServiceContext,
  input: z.output<typeof decideInput>,
  registry: Registry,
): Promise<DecideResult | 'expired'> {
  // Lock order: organization, then the request (members.remove cancels requests after taking
  // the organization, so this can't deadlock with it).
  await lockOrganization(tx, ctx.organizationId)
  const request = await lockRequest(tx, ctx.organizationId, input.requestId)
  if (!request) throw notFound()
  const standing = await viewerStanding(tx, ctx.organizationId, request.id, {
    memberId: ctx.member.id,
    userId: ctx.user.id,
  })
  if (!standing || !(standing.isMaker || standing.couldApprove || standing.decided)) {
    throw notFound()
  }
  if (request.status !== 'pending') throw await endedError(tx, request)
  if (input.step !== undefined && input.step !== request.currentStep) {
    // The step they were looking at was decided while they read it.
    throw await endedError(tx, request)
  }
  if (request.expiresAt <= new Date()) {
    await endRequest(tx, request, 'expired', 'timeout', SYSTEM_ACTOR)
    return 'expired'
  }
  if (standing.isMaker) throw ownRequest()
  if (standing.decided) {
    throw notEligible(
      'You approved an earlier step of this request, so someone else approves this one.',
    )
  }
  if (!standing.couldApprove) throw notFound()
  const plugin = pluginFor(registry, request.actionKey)
  const exclusion =
    request.exclusions.find((e) => e.userId === ctx.user.id) ??
    (await plugin.excluded(tx, ctx, request.payload)).find((e) => e.userId === ctx.user.id)
  if (exclusion) throw notEligible(exclusion.reason)

  const summary = approvalSummary.parse(request.summary)
  await tx.insert(approvalDecisions).values({
    organizationId: ctx.organizationId,
    requestId: request.id,
    position: request.currentStep,
    memberId: ctx.member.id,
    userId: ctx.user.id,
    memberName: ctx.user.name,
    decision: input.decision,
    comment: input.comment?.trim() || null,
  })
  const actor = { userId: ctx.user.id, name: ctx.user.name }
  const base = auditBase(request, summary)
  const comment = input.comment?.trim() || null

  if (input.decision === 'reject') {
    await finish(tx, request, 'rejected')
    await recordAudit(tx, {
      ...base,
      action: 'approval.rejected',
      actor,
      metadata: { ...base.metadata, position: request.currentStep, comment },
    })
    return {
      notice: `${summary.title} rejected · ${request.makerName} will see your comment`,
      ran: false,
      emails: await makerEmail(tx, request, summary, 'reject', ctx.user.name, comment),
      afterCommit: null,
    }
  }

  if (request.currentStep < request.stepCount) {
    await tx
      .update(approvalRequests)
      .set({ currentStep: request.currentStep + 1 })
      .where(eq(approvalRequests.id, request.id))
    await recordAudit(tx, {
      ...base,
      action: 'approval.step_approved',
      actor,
      metadata: { ...base.metadata, position: request.currentStep, comment },
    })
    const approvers = await eligibleForRequest(tx, ctx.organizationId, request.id)
    const approvedSoFar = (await approversOf(tx, request.id)).map(
      (a) => `${a.name} (step ${a.position})`,
    )
    return {
      notice: `${summary.title} approved · now with ${await stepWords(tx, request.id, request.currentStep + 1)}`,
      ran: false,
      emails: approvalNeededMessages({
        organizationName: ctx.organizationName,
        requestId: request.id,
        makerName: request.makerName,
        summary,
        reason: request.reason,
        approvedSoFar,
        to: approvers,
      }),
      afterCommit: null,
    }
  }

  // The last step: the action runs now, in this transaction, as the maker's change.
  const approvedBy = await approversOf(tx, request.id)
  const maker = await makerContext(tx, ctx, request)
  let result: ExecuteResult
  try {
    if (
      !maker ||
      !hasPermission(maker.member.permissions, plugin.permission.module, plugin.permission.action)
    ) {
      throw new StaleError('The maker left or lost the permission')
    }
    result = await plugin.execute(tx, maker, request.payload, {
      approvedBy,
      approvalRequestId: request.id,
      noApprover: false,
    })
  } catch (error) {
    if (error instanceof StaleError || (error instanceof ORPCError && error.status < 500)) {
      throw new ExecuteRefused(summary.recordLabel)
    }
    throw error
  }
  await finish(tx, request, 'approved')
  await recordAudit(tx, {
    ...base,
    action: 'approval.approved',
    actor,
    metadata: { ...base.metadata, position: request.currentStep, comment, approvedBy },
  })
  return {
    notice: `${summary.title} approved`,
    ran: true,
    emails: [
      ...result.emails,
      ...(await makerEmail(tx, request, summary, 'approve', ctx.user.name, comment)),
    ],
    afterCommit: result.afterCommit,
  }
}

function pluginFor(registry: Registry, actionKey: string): RegisteredPlugin {
  if (!isApprovalActionKey(actionKey)) throw new Error(`No approvals plug-in for ${actionKey}`)
  return registry[actionKey]
}

export async function lockRequest(
  tx: DbOrTx,
  organizationId: string,
  id: string,
): Promise<RequestRow | null> {
  const [row] = await tx
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.organizationId, organizationId), eq(approvalRequests.id, id)))
    .for('update')
  return row ?? null
}

/** Why a request that isn't pending (or moved on) can't be decided, in the spec's words. */
async function endedError(tx: DbOrTx, request: RequestRow): Promise<ORPCError<string, unknown>> {
  if (request.status === 'expired') {
    if (request.endedReason === 'stale') {
      return requestStale(approvalSummary.parse(request.summary).recordLabel)
    }
    return requestExpired()
  }
  if (request.status === 'cancelled') return notPending('This request was cancelled.')
  const [last] = await tx
    .select({ name: approvalDecisions.memberName, decision: approvalDecisions.decision })
    .from(approvalDecisions)
    .where(eq(approvalDecisions.requestId, request.id))
    .orderBy(sql`${approvalDecisions.position} desc`)
    .limit(1)
  return last ? decidedMomentAgo(last.name, last.decision) : notPending()
}

/** The approvals so far, in step order, for the action's audit event and the emails. */
async function approversOf(tx: DbOrTx, requestId: string): Promise<Approver[]> {
  return tx
    .select({ name: approvalDecisions.memberName, position: approvalDecisions.position })
    .from(approvalDecisions)
    .where(
      and(eq(approvalDecisions.requestId, requestId), eq(approvalDecisions.decision, 'approve')),
    )
    .orderBy(approvalDecisions.position)
}

/** "Owner or Admin": the roles of a step. */
async function stepWords(tx: DbOrTx, requestId: string, position: number): Promise<string> {
  const result = await tx.execute<{ name: string }>(sql`
    select ro.name from approval_request_step_roles sr
    join roles ro on ro.id = sr.role_id and ro.organization_id = sr.organization_id
    where sr.request_id = ${requestId} and sr.position = ${position}
    order by array_position(${SYSTEM_ORDER}, ro.key) nulls last, lower(ro.name)
  `)
  return stepText(result.rows.map((r) => r.name))
}

/**
 * The maker as they are now (plan question 3: the change is theirs). Null when they left, or came
 * back as a different member, or no longer have the permission the action needs: the request is
 * then out of date.
 */
async function makerContext(
  tx: DbOrTx,
  ctx: ServiceContext,
  request: RequestRow,
): Promise<ServiceContext | null> {
  const membership = await loadMembership(tx, request.makerUserId, ctx.organizationId)
  if (
    !membership ||
    membership.organizationId !== ctx.organizationId ||
    membership.member.id !== request.makerMemberId
  ) {
    return null
  }
  const [user] = await tx
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, request.makerUserId))
  if (!user) return null
  return {
    db: tx,
    organizationId: ctx.organizationId,
    organizationName: membership.organizationName,
    user,
    member: membership.member,
    sessionId: null,
    features: ctx.features,
  }
}

function auditBase(request: RequestRow, summary: ApprovalSummary) {
  return {
    organizationId: request.organizationId,
    target: { type: request.subjectType, id: request.subjectId, label: summary.title },
    metadata: {
      approvalRequestId: request.id,
      actionKey: request.actionKey,
      module: request.module,
      entityId: request.entityId,
    } as Record<string, unknown>,
  }
}

async function finish(tx: DbOrTx, request: RequestRow, status: 'approved' | 'rejected') {
  await tx
    .update(approvalRequests)
    .set({ status, decidedAt: new Date() })
    .where(eq(approvalRequests.id, request.id))
}

async function makerEmail(
  tx: DbOrTx,
  request: RequestRow,
  summary: ApprovalSummary,
  decision: 'approve' | 'reject',
  deciderName: string,
  comment: string | null,
): Promise<EmailMessage[]> {
  const [maker] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, request.makerUserId))
  if (!maker) return []
  return [
    approvalDecidedMessage({
      to: maker.email,
      requestId: request.id,
      title: summary.title,
      decision,
      deciderName,
      comment,
    }),
  ]
}

// ---------------------------------------------------------------------------------------------
// Ending without a decision

/** Marks a pending request ended and audits it once. */
async function endRequest(
  tx: DbOrTx,
  request: Pick<
    RequestRow,
    | 'id'
    | 'organizationId'
    | 'subjectType'
    | 'subjectId'
    | 'summary'
    | 'actionKey'
    | 'module'
    | 'entityId'
  >,
  status: 'cancelled' | 'expired',
  endedReason: 'timeout' | 'stale' | 'maker_left' | 'maker',
  actor: AuditActor,
  note?: string,
): Promise<void> {
  await tx
    .update(approvalRequests)
    .set({ status, endedReason, decidedAt: new Date() })
    .where(and(eq(approvalRequests.id, request.id), eq(approvalRequests.status, 'pending')))
  const summary = approvalSummary.parse(request.summary)
  await recordAudit(tx, {
    organizationId: request.organizationId,
    action: status === 'cancelled' ? 'approval.cancelled' : 'approval.expired',
    actor,
    target: { type: request.subjectType, id: request.subjectId, label: summary.title },
    metadata: {
      approvalRequestId: request.id,
      actionKey: request.actionKey,
      module: request.module,
      entityId: request.entityId,
      endedReason,
      ...(note && { note }),
    },
  })
}

/** The maker cancels their own pending request. Anyone else: not found. */
export async function cancelRequest(ctx: ServiceContext, id: string): Promise<{ notice: string }> {
  const outcome = await ctx.db.transaction(async (tx) => {
    const request = await lockRequest(tx, ctx.organizationId, id)
    if (!request || request.makerMemberId !== ctx.member.id) throw notFound()
    if (request.status !== 'pending') throw await endedError(tx, request)
    if (request.expiresAt <= new Date()) {
      await endRequest(tx, request, 'expired', 'timeout', SYSTEM_ACTOR)
      return 'expired' as const
    }
    await endRequest(tx, request, 'cancelled', 'maker', {
      userId: ctx.user.id,
      name: ctx.user.name,
    })
    return 'cancelled' as const
  })
  if (outcome === 'expired') throw requestExpired()
  return { notice: APPROVAL_COPY.requestCancelled }
}

/**
 * The maker left the organization: their pending requests are cancelled ("Cancelled because
 * Grace Umeh left") in the removal's own transaction, audited as the person who removed them.
 */
export async function cancelForLeaver(
  tx: DbOrTx,
  input: { organizationId: string; memberId: string; makerName: string; actor: AuditActor },
): Promise<number> {
  const rows = await tx
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, input.organizationId),
        eq(approvalRequests.makerMemberId, input.memberId),
        eq(approvalRequests.status, 'pending'),
      ),
    )
    .for('update')
  for (const row of rows) {
    await endRequest(
      tx,
      row,
      'cancelled',
      'maker_left',
      input.actor,
      cancelledForLeaverText(input.makerName),
    )
  }
  return rows.length
}

/** At most this many per transaction, so a backlog never holds locks for long. */
export const EXPIRE_BATCH = 500

/**
 * Expires pending requests past their 7 days, oldest first, in batches; each one audited once.
 * Concurrent sweeps skip each other's rows. `organizationId` limits it to one organization (on
 * read); without it, it's the daily command.
 */
export async function expireDue(
  db: DbOrTx,
  now: Date = new Date(),
  organizationId?: string,
): Promise<number> {
  let total = 0
  for (;;) {
    const n = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.status, 'pending'),
            sql`${approvalRequests.expiresAt} <= ${now}`,
            organizationId ? eq(approvalRequests.organizationId, organizationId) : undefined,
          ),
        )
        .orderBy(approvalRequests.expiresAt)
        .limit(EXPIRE_BATCH)
        .for('update', { skipLocked: true })
      for (const row of rows) await endRequest(tx, row, 'expired', 'timeout', SYSTEM_ACTOR)
      return rows.length
    })
    total += n
    if (n < EXPIRE_BATCH) return total
  }
}

/** Expiry applied on read: only when this organization has a pending request past its time. */
export async function expireOnRead(db: DbOrTx, organizationId: string): Promise<void> {
  const result = await db.execute<{ due: boolean }>(sql`
    select exists (select 1 from approval_requests
      where organization_id = ${organizationId} and status = 'pending' and expires_at <= now()) as due
  `)
  if (result.rows[0]?.due) await expireDue(db, new Date(), organizationId)
}
