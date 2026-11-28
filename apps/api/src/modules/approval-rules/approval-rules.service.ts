import {
  APPROVAL_ACTION_KEYS,
  APPROVAL_ACTIONS,
  APPROVAL_COPY,
  type ApprovalActionKey,
  type ApprovalRuleRow,
  type ApprovalRulesList,
  type approvalRuleInput,
  belowThresholdLine,
  cannotApproveInModuleText,
  companiesText,
  type deleteApprovalRuleInput,
  duplicateRuleMessage,
  gapText,
  hasPermission,
  type PermissionModule,
  RULE_ACTION_KEYS,
  type SystemRoleKey,
  stepText,
  uncoveredText,
  type updateApprovalRuleInput,
  whenText,
} from '@vento/shared'
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, lockViewer, type ServiceContext } from '@/access/context'
import { actionAvailable as featureHasAction } from '@/approvals/availability'
import { type LoadedRule, loadRules } from '@/approvals/rules'
import { webUrl } from '@/auth/hooks/deps'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  approvalRuleEntities,
  approvalRuleStepRoles,
  approvalRuleSteps,
  approvalRules,
  auditEvents,
  entities,
  members,
  roles,
  users,
} from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import {
  approvalRuleChangedEmail,
  type RuleChangeLine,
} from '@/email/templates/approval-rule-changed'
import { conflict, forbidden, isUniqueViolation, notFound } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import { recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'
import { loadRoles } from '@/modules/roles/roles.service'

type RuleInput = z.output<typeof approvalRuleInput>

// Settings → Approval rules (SetApprovalRules board). Owners with access to every company change
// them; everyone with Settings view reads them. Requests keep the steps they were made with.

// ---------------------------------------------------------------------------------------------
// Reading

type Approver = { roleId: string; approves: PermissionModule[]; entityIds: string[] | null }

/** Every active member's role, the modules it approves in and their company limits, in one query. */
async function approvers(db: DbOrTx, organizationId: string): Promise<Approver[]> {
  const result = await db.execute<{
    role_id: string
    approves: PermissionModule[] | null
    entity_ids: string[] | null
  }>(sql`
    select m.role_id,
      (select array_agg(rp.module::text) from role_permissions rp
        where rp.organization_id = m.organization_id and rp.role_id = m.role_id
          and rp.action = 'approve') as approves,
      (select array_agg(l.entity_id) from member_entity_limits l
        where l.organization_id = m.organization_id and l.member_id = m.id) as entity_ids
    from members m
    where m.organization_id = ${organizationId} and m.status = 'active'`)
  return result.rows.map((r) => ({
    roleId: r.role_id,
    approves: r.approves ?? [],
    entityIds: r.entity_ids,
  }))
}

/**
 * "Nobody can approve step 2 in Parkview SPV": a step with nobody eligible today, per company in
 * scope. An all-company rule is checked as organization-wide (people with no company limits),
 * which is exactly who approves the platform actions; archived companies are skipped.
 */
function gapsOf(rule: LoadedRule, module: PermissionModule, people: readonly Approver[]) {
  const scopes: ({ id: string; name: string } | null)[] =
    rule.entities === 'all' ? [null] : rule.entities.filter((e) => !e.archived)
  return rule.steps.flatMap((step, i) => {
    const roleIds = new Set(step.map((r) => r.id))
    return scopes.flatMap((scope) => {
      const someone = people.some(
        (p) =>
          roleIds.has(p.roleId) &&
          p.approves.includes(module) &&
          (p.entityIds === null || (scope !== null && p.entityIds.includes(scope.id))),
      )
      if (someone) return []
      const entity = scope ? { id: scope.id, name: scope.name } : null
      return [{ position: i + 1, entity, text: gapText(i + 1, scope?.name ?? null) }]
    })
  })
}

function toRow(rule: LoadedRule, people: readonly Approver[]): ApprovalRuleRow {
  const meta = APPROVAL_ACTIONS[rule.actionKey]
  const steps = rule.steps.map((roles, i) => ({
    position: i + 1,
    roles,
    text: stepText(roles.map((r) => r.name)),
  }))
  return {
    id: rule.id,
    version: rule.version,
    actionKey: rule.actionKey,
    minAmount: rule.minAmount,
    whenText: whenText(rule.minAmount),
    steps,
    chain: steps.map((s) => s.text).join(' → '),
    entities: rule.entities,
    extraCondition: meta.extraCondition,
    gaps: gapsOf(rule, meta.module, people),
    updatedAt: rule.updatedAt.toISOString(),
  }
}

/** Owners with access to every company change rules; the page reads this flag. */
export function canEditRules(ctx: Pick<ServiceContext, 'member'>): boolean {
  return ctx.member.roleKey === 'owner' && ctx.member.entityIds === null
}

/** Whether the organization has the action's feature (platform actions: always). */
export function actionAvailable(
  ctx: Pick<ServiceContext, 'features'>,
  actionKey: ApprovalActionKey,
): boolean {
  return featureHasAction(ctx.features, actionKey)
}

type Company = { id: string; name: string }

/**
 * An action that refuses without a rule (decision 0026): the active companies no rule covers,
 * where it's refused. An all-company rule covers everything; no rule at all is one warning.
 */
function uncoveredOf(
  actionKey: ApprovalActionKey,
  rules: readonly LoadedRule[],
  companies: readonly Company[],
) {
  if (APPROVAL_ACTIONS[actionKey].whenNoRule === 'run') return []
  if (rules.length === 0) return [{ entity: null, text: uncoveredText(actionKey, null) }]
  if (rules.some((r) => r.entities === 'all')) return []
  const covered = new Set(rules.flatMap((r) => (r.entities === 'all' ? [] : r.entityIds)))
  return companies
    .filter((c) => !covered.has(c.id))
    .map((c) => ({ entity: c, text: uncoveredText(actionKey, c.name) }))
}

async function activeCompanies(db: DbOrTx, organizationId: string): Promise<Company[]> {
  return db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.organizationId, organizationId), eq(entities.status, 'active')))
    .orderBy(sql`lower(${entities.name})`, entities.id)
}

export async function listRules(ctx: ServiceContext): Promise<ApprovalRulesList> {
  const [rules, people, companies] = await runQueries(ctx.db, [
    () => loadRules(ctx.db, ctx.organizationId),
    () => approvers(ctx.db, ctx.organizationId),
    () => activeCompanies(ctx.db, ctx.organizationId),
  ])
  // Rules for a feature the organization doesn't have stay hidden (decision 0026).
  const items = RULE_ACTION_KEYS.filter((k) => actionAvailable(ctx, k)).map((actionKey) => {
    const forAction = rules.filter((r) => r.actionKey === actionKey)
    return {
      actionKey,
      label: APPROVAL_ACTIONS[actionKey].label,
      module: APPROVAL_ACTIONS[actionKey].module,
      belowThreshold: belowThresholdLine(forAction.filter((r) => r.entities === 'all')),
      rules: forAction.map((r) => toRow(r, people)),
      uncovered: uncoveredOf(actionKey, forAction, companies),
    }
  })
  return { items, canEdit: canEditRules(ctx) }
}

// ---------------------------------------------------------------------------------------------
// Changing

/** The rule in words, for the audit trail and the owners' email (never ids). */
function ruleWords(
  rule: LoadedRule,
): Record<'action' | 'when' | 'approvedBy' | 'companies', string> {
  return {
    action: APPROVAL_ACTIONS[rule.actionKey].label,
    when: whenText(rule.minAmount),
    approvedBy: rule.steps.map((s) => stepText(s.map((r) => r.name))).join(' → '),
    companies:
      rule.entities === 'all' ? 'All companies' : companiesText(rule.entities.map((e) => e.name)),
  }
}

/** "Change a role's permissions" or "Purchase order over ₦20,000,000": the audit target. */
function ruleLabel(rule: Pick<LoadedRule, 'actionKey' | 'minAmount'>): string {
  const label = APPROVAL_ACTIONS[rule.actionKey].label
  return rule.minAmount === null ? label : `${label} ${whenText(rule.minAmount).toLowerCase()}`
}

const ownersOnly = () => forbidden('owner_only', APPROVAL_COPY.ownersOnly)

/** The changer as they are now: still an owner with every company (their role may have moved). */
async function lockOwner(tx: DbOrTx, ctx: ServiceContext): Promise<ServiceContext> {
  await lockOrganization(tx, ctx.organizationId)
  const live = await lockViewer(tx, ctx)
  if (!canEditRules(live)) throw ownersOnly()
  return live
}

/** Roles that exist, are live, and have Approve in the action's module. */
async function assertRoles(tx: DbOrTx, organizationId: string, input: RuleInput): Promise<void> {
  const ids = [...new Set(input.steps.flat())]
  const found = await loadRoles(tx, organizationId, ids)
  if (found.length !== ids.length) {
    throw conflict('role_unavailable', 'That role no longer exists. Choose another.')
  }
  const module = APPROVAL_ACTIONS[input.actionKey].module
  const cannot = found.find((r) => !hasPermission(r.permissions, module, 'approve'))
  if (cannot) throw conflict('role_unavailable', cannotApproveInModuleText(cannot.name, module))
}

/** Companies that are this organization's and active. */
async function assertEntities(
  tx: DbOrTx,
  organizationId: string,
  entityIds: 'all' | string[],
): Promise<void> {
  if (entityIds === 'all') return
  const rows = await tx
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, organizationId),
        inArray(entities.id, entityIds),
        eq(entities.status, 'active'),
      ),
    )
  if (rows.length !== entityIds.length) {
    throw conflict(
      'entity_unavailable',
      'That company is archived or no longer exists. Choose again.',
    )
  }
}

const minAmountOf = (input: RuleInput): string | null =>
  input.when.kind === 'over' ? input.when.amount : null

/**
 * Another rule for the same action and threshold whose companies overlap (all-company rules are
 * one scope): the matcher could then pick either. Checked under the organization lock; the
 * partial unique index backs up the all-company case.
 */
async function assertNoDuplicate(
  tx: DbOrTx,
  organizationId: string,
  input: RuleInput,
  exceptId: string | null,
): Promise<void> {
  const minAmount = minAmountOf(input)
  const same = sql`ar.organization_id = ${organizationId} and ar.action_key = ${input.actionKey}
    and coalesce(ar.min_amount, 0) = coalesce(${minAmount}::numeric, 0)
    ${exceptId ? sql`and ar.id <> ${exceptId}` : sql``}`
  const where =
    input.entityIds === 'all'
      ? sql`${same} and ar.applies_to_all`
      : sql`${same} and not ar.applies_to_all`
  const overlapping =
    input.entityIds === 'all'
      ? sql`null::text`
      : sql`(select string_agg(e.name, ', ' order by e.name) from approval_rule_entities re
          join entities e on e.id = re.entity_id and e.organization_id = re.organization_id
          where re.rule_id = ar.id and re.entity_id in (${sql.join(
            input.entityIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`
  const result = await tx.execute<{ names: string | null }>(sql`
    select ${overlapping} as names from approval_rules ar where ${where}`)
  const clash = result.rows.find((r) => input.entityIds === 'all' || r.names !== null)
  if (!clash) return
  throw duplicate(input, clash.names === null ? 'all' : clash.names.split(', '))
}

function duplicate(input: RuleInput, entityNames: 'all' | string[]) {
  return conflict(
    'approval_rule_exists',
    duplicateRuleMessage({
      actionKey: input.actionKey,
      minAmount: minAmountOf(input),
      entityNames,
    }),
  )
}

async function writeRule(
  tx: DbOrTx,
  organizationId: string,
  ruleId: string,
  input: RuleInput,
): Promise<void> {
  for (const [i, roleIds] of input.steps.entries()) {
    const [step] = await tx
      .insert(approvalRuleSteps)
      .values({ organizationId, ruleId, position: i + 1 })
      .returning({ id: approvalRuleSteps.id })
    if (!step) throw new Error('Approval rule step insert returned nothing')
    await tx
      .insert(approvalRuleStepRoles)
      .values(roleIds.map((roleId) => ({ organizationId, stepId: step.id, roleId })))
  }
  if (input.entityIds !== 'all') {
    await tx
      .insert(approvalRuleEntities)
      .values(input.entityIds.map((entityId) => ({ organizationId, ruleId, entityId })))
  }
}

async function onDuplicateRace<T>(input: RuleInput, write: Promise<T>): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isUniqueViolation(error, 'approval_rules_all_scope_unique')) throw duplicate(input, 'all')
    throw error
  }
}

async function reload(tx: DbOrTx, organizationId: string, id: string): Promise<LoadedRule> {
  const [rule] = await loadRules(tx, organizationId, undefined, [id])
  if (!rule) throw notFound()
  return rule
}

export type RuleChange = { notice: string; rule: ApprovalRuleRow; emails: EmailMessage[] }

export async function createRule(ctx: ServiceContext, input: RuleInput): Promise<RuleChange> {
  if (!actionAvailable(ctx, input.actionKey)) throw notFound()
  return ctx.db.transaction(async (tx) => {
    const live = await lockOwner(tx, ctx)
    await assertRoles(tx, live.organizationId, input)
    await assertEntities(tx, live.organizationId, input.entityIds)
    await assertNoDuplicate(tx, live.organizationId, input, null)
    const [row] = await onDuplicateRace(
      input,
      tx
        .insert(approvalRules)
        .values({
          organizationId: live.organizationId,
          actionKey: input.actionKey,
          minAmount: minAmountOf(input),
          appliesToAll: input.entityIds === 'all',
          createdByMemberId: live.member.id,
        })
        .returning({ id: approvalRules.id }),
    )
    if (!row) throw new Error('Approval rule insert returned nothing')
    await writeRule(tx, live.organizationId, row.id, input)
    const rule = await reload(tx, live.organizationId, row.id)
    const after = ruleWords(rule)
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'approval_rule.created',
      actor: actorOf(live),
      target: { type: 'approval_rule', id: rule.id, label: ruleLabel(rule) },
      after,
      metadata: { actionKey: rule.actionKey, version: rule.version },
    })
    return {
      notice: APPROVAL_COPY.ruleSaved,
      rule: toRow(rule, await approvers(tx, live.organizationId)),
      emails: await ownerEmails(tx, live, 'added', rule.actionKey, lines(null, after)),
    }
  })
}

/** Who saved or deleted the rule last, for "Aisha Bello changed this rule a moment ago". */
async function lastChangedBy(tx: DbOrTx, organizationId: string, ruleId: string): Promise<string> {
  const [row] = await tx
    .select({ name: auditEvents.actorName })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.targetType, 'approval_rule'),
        eq(auditEvents.targetId, ruleId),
        like(auditEvents.action, 'approval_rule.%'),
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(1)
  return row?.name ?? 'Someone'
}

async function lockRule(tx: DbOrTx, organizationId: string, id: string) {
  const [row] = await tx
    .select({ id: approvalRules.id, version: approvalRules.version })
    .from(approvalRules)
    .where(and(eq(approvalRules.organizationId, organizationId), eq(approvalRules.id, id)))
    .for('update')
  return row ?? null
}

export async function updateRule(
  ctx: ServiceContext,
  input: z.output<typeof updateApprovalRuleInput>,
): Promise<RuleChange> {
  if (!actionAvailable(ctx, input.actionKey)) throw notFound()
  return ctx.db.transaction(async (tx) => {
    const live = await lockOwner(tx, ctx)
    const locked = await lockRule(tx, live.organizationId, input.id)
    if (!locked) {
      // Deleted since the sheet opened: say who, like a version clash.
      const by = await lastChangedBy(tx, live.organizationId, input.id)
      if (by === 'Someone') throw notFound()
      throw changed(by)
    }
    if (locked.version !== input.version) {
      throw changed(await lastChangedBy(tx, live.organizationId, input.id))
    }
    const { id: _id, version: _version, ...fields } = input
    await assertRoles(tx, live.organizationId, fields)
    await assertEntities(tx, live.organizationId, fields.entityIds)
    await assertNoDuplicate(tx, live.organizationId, fields, input.id)
    const before = await reload(tx, live.organizationId, input.id)
    await tx
      .delete(approvalRuleSteps)
      .where(
        and(
          eq(approvalRuleSteps.organizationId, live.organizationId),
          eq(approvalRuleSteps.ruleId, input.id),
        ),
      )
    await tx
      .delete(approvalRuleEntities)
      .where(
        and(
          eq(approvalRuleEntities.organizationId, live.organizationId),
          eq(approvalRuleEntities.ruleId, input.id),
        ),
      )
    await onDuplicateRace(
      fields,
      tx
        .update(approvalRules)
        .set({
          actionKey: fields.actionKey,
          minAmount: minAmountOf(fields),
          appliesToAll: fields.entityIds === 'all',
          version: sql`${approvalRules.version} + 1`,
        })
        .where(
          and(
            eq(approvalRules.organizationId, live.organizationId),
            eq(approvalRules.id, input.id),
          ),
        ),
    )
    await writeRule(tx, live.organizationId, input.id, fields)
    const rule = await reload(tx, live.organizationId, input.id)
    const [was, now] = [ruleWords(before), ruleWords(rule)]
    const keys = (Object.keys(now) as (keyof typeof now)[]).filter((k) => was[k] !== now[k])
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'approval_rule.updated',
      actor: actorOf(live),
      target: { type: 'approval_rule', id: rule.id, label: ruleLabel(rule) },
      before: Object.fromEntries(keys.map((k) => [k, was[k]])),
      after: Object.fromEntries(keys.map((k) => [k, now[k]])),
      metadata: { actionKey: rule.actionKey, version: rule.version },
    })
    return {
      notice: APPROVAL_COPY.ruleSaved,
      rule: toRow(rule, await approvers(tx, live.organizationId)),
      emails: await ownerEmails(tx, live, 'changed', rule.actionKey, lines(was, now)),
    }
  })
}

function changed(by: string) {
  return conflict(
    'approval_rule_changed',
    `${by} changed this rule a moment ago. Reload to see the latest, then make your change again.`,
    { changedByName: by },
  )
}

/** `version` as loaded (security L3): a rule saved since then isn't deleted unseen. */
export async function deleteRule(
  ctx: ServiceContext,
  input: z.output<typeof deleteApprovalRuleInput>,
): Promise<{ notice: string; emails: EmailMessage[] }> {
  const { id } = input
  return ctx.db.transaction(async (tx) => {
    const live = await lockOwner(tx, ctx)
    const locked = await lockRule(tx, live.organizationId, id)
    if (!locked) throw notFound()
    if (locked.version !== input.version) {
      throw changed(await lastChangedBy(tx, live.organizationId, id))
    }
    const rule = await reload(tx, live.organizationId, id)
    // Pending requests keep their copied steps; only the rule goes.
    await tx
      .delete(approvalRules)
      .where(and(eq(approvalRules.organizationId, live.organizationId), eq(approvalRules.id, id)))
    const before = ruleWords(rule)
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'approval_rule.deleted',
      actor: actorOf(live),
      target: { type: 'approval_rule', id, label: ruleLabel(rule) },
      before,
      metadata: { actionKey: rule.actionKey, version: rule.version },
    })
    return {
      notice: 'Rule deleted',
      emails: await ownerEmails(tx, live, 'deleted', rule.actionKey, lines(before, null)),
    }
  })
}

type Words = ReturnType<typeof ruleWords>

const LINE_LABELS: Record<keyof Words, string> = {
  action: 'Action',
  when: 'When',
  approvedBy: 'Approved by',
  companies: 'Companies',
}

function lines(before: Words | null, after: Words | null): RuleChangeLine[] {
  return (Object.keys(LINE_LABELS) as (keyof Words)[])
    .filter((k) => before === null || after === null || before[k] !== after[k])
    .map((k) => ({ label: LINE_LABELS[k], before: before?.[k] ?? null, after: after?.[k] ?? null }))
}

/** At most this many owners are emailed about one change. */
const MAX_OWNER_EMAILS = 50

/** "Olumide Bankole changed an approval rule" to every other active owner (plan question 4). */
async function ownerEmails(
  tx: DbOrTx,
  live: ServiceContext,
  verb: 'added' | 'changed' | 'deleted',
  actionKey: ApprovalActionKey,
  changes: RuleChangeLine[],
): Promise<EmailMessage[]> {
  const owners = await tx
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, live.organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
        sql`${members.id} <> ${live.member.id}`,
      ),
    )
    .orderBy(users.email)
    .limit(MAX_OWNER_EMAILS)
  if (owners.length === 0) return []
  const now = new Date()
  const rendered = approvalRuleChangedEmail({
    byName: live.user.name,
    organizationName: live.organizationName,
    verb,
    actionLabel: APPROVAL_ACTIONS[actionKey].label,
    lines: changes,
    at: formatTime(now),
    on: formatDate(now),
    url: webUrl('/settings/approval-rules'),
  })
  return owners.map((o) => ({ to: o.email, tag: 'approval' as const, ...rendered }))
}

// ---------------------------------------------------------------------------------------------
// Defaults

/**
 * The catalog's default rules for an organization (spec open question 6), created by its first
 * owner. Run when an organization is created; migration 0017 did the same for existing ones.
 * Skips any action that already has a rule, so it's safe to run again.
 */
export async function seedDefaultRules(
  tx: DbOrTx,
  organizationId: string,
  createdByMemberId: string,
): Promise<void> {
  const roleRows = await tx
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), sql`${roles.key} is not null`))
  const idByKey = new Map(roleRows.map((r) => [r.key as SystemRoleKey, r.id]))
  const existing = new Set(
    (
      await tx
        .select({ actionKey: approvalRules.actionKey })
        .from(approvalRules)
        .where(eq(approvalRules.organizationId, organizationId))
    ).map((r) => r.actionKey),
  )
  for (const actionKey of APPROVAL_ACTION_KEYS) {
    if (existing.has(actionKey)) continue
    for (const rule of APPROVAL_ACTIONS[actionKey].defaults) {
      const [row] = await tx
        .insert(approvalRules)
        .values({
          organizationId,
          actionKey,
          minAmount: rule.minAmount,
          appliesToAll: true,
          createdByMemberId,
        })
        .returning({ id: approvalRules.id })
      if (!row) throw new Error('Default approval rule insert returned nothing')
      await writeRule(tx, organizationId, row.id, {
        actionKey,
        when: rule.minAmount === null ? { kind: 'any' } : { kind: 'over', amount: rule.minAmount },
        steps: rule.steps.map((step) => step.map((key) => idByKey.get(key) ?? '')),
        entityIds: 'all',
      })
    }
  }
}
