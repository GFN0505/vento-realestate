import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { members, permissionModule, roles } from './access'
import { users } from './auth'
import { entities, organizations } from './organization'

// Approvals (brick 4, decision 0024). Rules say which actions need a second person; a request
// keeps a copy of its rule's steps as rows, so editing a rule never changes one in flight.

export const approvalRequestStatus = pgEnum('approval_request_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
])

/** Why a request ended without a decision. */
export const approvalEndedReason = pgEnum('approval_ended_reason', [
  'timeout',
  'stale',
  'maker_left',
  'maker',
])

export const approvalDecisionKind = pgEnum('approval_decision', ['approve', 'reject'])

export const approvalRules = pgTable(
  'approval_rules',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    /** One of APPROVAL_ACTION_KEYS in @vento/shared (text: the catalog grows every brick). */
    actionKey: text().notNull(),
    /** "Over" this NGN amount; null = any amount. */
    minAmount: numeric({ precision: 14, scale: 2 }),
    /** Every company, now and later; otherwise approval_rule_entities names them. */
    appliesToAll: boolean().notNull(),
    /** Bumped on every save (optimistic concurrency, as on roles). */
    version: integer().notNull().default(1),
    createdByMemberId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('approval_rules_org_id_unique').on(t.organizationId, t.id),
    // One all-company rule per action and threshold. Thresholds are above zero, so coalescing
    // "any amount" to 0 can't collide with a real one (and nulls compare equal).
    uniqueIndex('approval_rules_all_scope_unique')
      .on(t.organizationId, t.actionKey, sql`coalesce(${t.minAmount}, 0)`)
      .where(sql`${t.appliesToAll}`),
    index('approval_rules_org_action_idx').on(t.organizationId, t.actionKey),
    index('approval_rules_created_by_idx').on(t.organizationId, t.createdByMemberId),
    foreignKey({
      name: 'approval_rules_created_by_fk',
      columns: [t.organizationId, t.createdByMemberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    check('approval_rules_min_amount_positive', sql`${t.minAmount} is null or ${t.minAmount} > 0`),
    check('approval_rules_version_positive', sql`${t.version} >= 1`),
  ],
)

export const approvalRuleSteps = pgTable(
  'approval_rule_steps',
  {
    id: id(),
    organizationId: uuid().notNull(),
    ruleId: uuid().notNull(),
    position: smallint().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('approval_rule_steps_org_id_unique').on(t.organizationId, t.id),
    uniqueIndex('approval_rule_steps_position_unique').on(t.ruleId, t.position),
    index('approval_rule_steps_org_idx').on(t.organizationId),
    foreignKey({
      name: 'approval_rule_steps_rule_fk',
      columns: [t.organizationId, t.ruleId],
      foreignColumns: [approvalRules.organizationId, approvalRules.id],
    }).onDelete('cascade'),
    check('approval_rule_steps_position_range', sql`${t.position} between 1 and 3`),
  ],
)

export const approvalRuleStepRoles = pgTable(
  'approval_rule_step_roles',
  {
    id: id(),
    organizationId: uuid().notNull(),
    stepId: uuid().notNull(),
    roleId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('approval_rule_step_roles_unique').on(t.stepId, t.roleId),
    // The role delete guard: "Site manager approves in 2 rules".
    index('approval_rule_step_roles_org_role_idx').on(t.organizationId, t.roleId),
    foreignKey({
      name: 'approval_rule_step_roles_step_fk',
      columns: [t.organizationId, t.stepId],
      foreignColumns: [approvalRuleSteps.organizationId, approvalRuleSteps.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'approval_rule_step_roles_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }).onDelete('restrict'),
  ],
)

export const approvalRuleEntities = pgTable(
  'approval_rule_entities',
  {
    id: id(),
    organizationId: uuid().notNull(),
    ruleId: uuid().notNull(),
    entityId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('approval_rule_entities_unique').on(t.ruleId, t.entityId),
    index('approval_rule_entities_org_entity_idx').on(t.organizationId, t.entityId),
    foreignKey({
      name: 'approval_rule_entities_rule_fk',
      columns: [t.organizationId, t.ruleId],
      foreignColumns: [approvalRules.organizationId, approvalRules.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'approval_rule_entities_entity_fk',
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.id],
    }).onDelete('restrict'),
  ],
)

export type ApprovalExclusion = { userId: string; reason: string }

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    actionKey: text().notNull(),
    /** Approvers need Approve here; copied from the catalog at request time. */
    module: permissionModule().notNull(),
    /** The request's company; null for organization-wide actions (roles, owners). */
    entityId: uuid(),
    /** The record the action works on: one pending request per record and action. */
    subjectType: text().notNull(),
    subjectId: uuid().notNull(),
    /** The plug-in's payload, re-validated when it runs. Never secrets. */
    payload: jsonb().notNull(),
    /** What the plug-in's describe() said at request time (ApprovalSummary). */
    summary: jsonb().notNull(),
    reason: text().notNull(),
    makerMemberId: uuid().notNull(),
    makerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** As at the time, so history reads right after a rename or removal. */
    makerName: text().notNull(),
    status: approvalRequestStatus().notNull().default('pending'),
    endedReason: approvalEndedReason(),
    currentStep: smallint().notNull().default(1),
    stepCount: smallint().notNull(),
    /** The rule it was made under, for display only: the steps are copied, the rule may go. */
    ruleId: uuid(),
    /** "Change a role's permissions needs approval by Owner or Admin." */
    policy: text().notNull(),
    /** People the action excludes (users.id), for the eligibility predicate. */
    excludedUserIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    /** The same people with the reason each one sees. */
    exclusions: jsonb().$type<ApprovalExclusion[]>().notNull().default(sql`'[]'::jsonb`),
    amount: numeric({ precision: 14, scale: 2 }),
    currency: char({ length: 3 }),
    /** A foreign amount at the rate the module recorded; rules compare this. */
    ngnAmount: numeric({ precision: 14, scale: 2 }),
    expiresAt: timestamptz().notNull(),
    /** When it ended, whichever way. */
    decidedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    unique('approval_requests_org_id_unique').on(t.organizationId, t.id),
    uniqueIndex('approval_requests_pending_subject_unique')
      .on(t.organizationId, t.actionKey, t.subjectType, t.subjectId)
      .where(sql`${t.status} = 'pending'`),
    index('approval_requests_org_status_created_idx').on(t.organizationId, t.status, t.createdAt),
    index('approval_requests_org_maker_created_idx').on(
      t.organizationId,
      t.makerMemberId,
      t.createdAt.desc(),
    ),
    // Expiry on read and the daily sweep only look at pending rows.
    index('approval_requests_pending_expires_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
    index('approval_requests_maker_user_idx').on(t.makerUserId),
    index('approval_requests_org_entity_idx').on(t.organizationId, t.entityId),
    foreignKey({
      name: 'approval_requests_maker_fk',
      columns: [t.organizationId, t.makerMemberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'approval_requests_entity_fk',
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.id],
    }),
    check('approval_requests_step_count_range', sql`${t.stepCount} between 1 and 3`),
    check(
      'approval_requests_current_step_range',
      sql`${t.currentStep} between 1 and ${t.stepCount}`,
    ),
    check(
      'approval_requests_ended_reason_consistent',
      sql`${t.endedReason} is null or ${t.status} in ('cancelled', 'expired')`,
    ),
    check(
      'approval_requests_decided_consistent',
      sql`(${t.status} = 'pending') = (${t.decidedAt} is null)`,
    ),
    check(
      'approval_requests_amount_consistent',
      sql`(${t.amount} is null) = (${t.currency} is null) and (${t.amount} is null) = (${t.ngnAmount} is null)`,
    ),
  ],
)

export const approvalRequestStepRoles = pgTable(
  'approval_request_step_roles',
  {
    id: id(),
    organizationId: uuid().notNull(),
    requestId: uuid().notNull(),
    position: smallint().notNull(),
    roleId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('approval_request_step_roles_unique').on(t.requestId, t.position, t.roleId),
    // The inbox: "requests whose current step includes my role".
    index('approval_request_step_roles_org_role_idx').on(t.organizationId, t.roleId, t.requestId),
    foreignKey({
      name: 'approval_request_step_roles_request_fk',
      columns: [t.organizationId, t.requestId],
      foreignColumns: [approvalRequests.organizationId, approvalRequests.id],
    }),
    foreignKey({
      name: 'approval_request_step_roles_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }),
    check('approval_request_step_roles_position_range', sql`${t.position} between 1 and 3`),
  ],
)

/** Append-only: triggers in migration 0017 refuse UPDATE, DELETE and TRUNCATE (decision 0024). */
export const approvalDecisions = pgTable(
  'approval_decisions',
  {
    id: id(),
    organizationId: uuid().notNull(),
    requestId: uuid().notNull(),
    position: smallint().notNull(),
    memberId: uuid().notNull(),
    /** Nobody decides two steps, even after leaving and joining again with a new member row. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** As at the time. */
    memberName: text().notNull(),
    decision: approvalDecisionKind().notNull(),
    comment: text(),
    ...timestamps,
  },
  (t) => [
    // One decision per step: a concurrent second one loses here.
    uniqueIndex('approval_decisions_position_unique').on(t.requestId, t.position),
    uniqueIndex('approval_decisions_user_unique').on(t.requestId, t.userId),
    // The Decided tab.
    index('approval_decisions_org_user_created_idx').on(
      t.organizationId,
      t.userId,
      t.createdAt.desc(),
    ),
    index('approval_decisions_org_member_idx').on(t.organizationId, t.memberId),
    foreignKey({
      name: 'approval_decisions_request_fk',
      columns: [t.organizationId, t.requestId],
      foreignColumns: [approvalRequests.organizationId, approvalRequests.id],
    }),
    foreignKey({
      name: 'approval_decisions_member_fk',
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    check('approval_decisions_position_range', sql`${t.position} between 1 and 3`),
    check(
      'approval_decisions_reject_has_comment',
      sql`${t.decision} = 'approve' or coalesce(btrim(${t.comment}), '') <> ''`,
    ),
  ],
)
