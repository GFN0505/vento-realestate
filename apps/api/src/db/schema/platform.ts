import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
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
import { users } from './auth'
import { organizations } from './organization'

// Feature flags and plans (docs/specs/feature-flags.md). Platform configuration has no
// organization_id (decision 0015); the organization_* tables are scoped as usual.

export const releaseStage = pgEnum('release_stage', ['off', 'internal', 'pilot', 'on'])
export const releaseGroup = pgEnum('release_group', ['standard', 'pilot', 'internal'])
export const overrideKind = pgEnum('override_kind', ['release', 'feature', 'limit'])
export const platformRole = pgEnum('platform_role', ['super_admin'])

/** Release stage per catalog key. No row = `internal` (a new flag starts there). */
export const featureReleases = pgTable(
  'feature_releases',
  {
    id: id(),
    featureKey: text().notNull(),
    stage: releaseStage().notNull(),
    reason: text().notNull(),
    changedByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('feature_releases_key_unique').on(t.featureKey),
    check('feature_releases_key_shape', sql`${t.featureKey} ~ '^[a-z_]+(\\.[a-z_]+)?$'`),
    check('feature_releases_reason_length', sql`char_length(${t.reason}) >= 3`),
  ],
)

export const plans = pgTable(
  'plans',
  {
    id: id(),
    key: text().notNull(),
    name: text().notNull(),
    sortOrder: smallint().notNull(),
    isDefaultForNew: boolean().notNull().default(false),
    archivedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('plans_key_unique').on(t.key),
    uniqueIndex('plans_sort_order_unique').on(t.sortOrder),
    // At most one live default plan for organizations that sign themselves up.
    uniqueIndex('plans_one_default')
      .on(t.isDefaultForNew)
      .where(sql`${t.isDefaultForNew} and ${t.archivedAt} is null`),
  ],
)

/** Immutable (trigger in 0004): a change publishes version n+1; organizations keep theirs. */
export const planVersions = pgTable(
  'plan_versions',
  {
    id: id(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    version: integer().notNull(),
    features: text().array().notNull().default(sql`'{}'::text[]`),
    /** `{ projects: 1, entities: 2, members: 10, ai_budget: "0.00" }`; missing = unlimited. */
    limits: jsonb().notNull().default(sql`'{}'::jsonb`),
    reason: text().notNull(),
    /** null = published by the seed or a migration. */
    publishedByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('plan_versions_plan_version_unique').on(t.planId, t.version),
    check('plan_versions_version_positive', sql`${t.version} > 0`),
    check('plan_versions_limits_object', sql`jsonb_typeof(${t.limits}) = 'object'`),
    check('plan_versions_features_no_nulls', sql`array_position(${t.features}, null) is null`),
  ],
)

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: platformRole().notNull().default('super_admin'),
    reason: text().notNull(),
    /** null = the bootstrap grant. */
    grantedByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    revokedAt: timestamptz(),
    revokedByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('platform_admins_user_active_unique')
      .on(t.userId)
      .where(sql`${t.revokedAt} is null`),
  ],
)

/** Vento-only trail of flag, plan and super-admin changes. Append-only (triggers in 0004). */
export const platformAuditEvents = pgTable(
  'platform_audit_events',
  {
    id: id(),
    /** null = a scheduled run. */
    actorUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    actorName: text().notNull(),
    /** `os-user@host` that ran the command. */
    operator: text(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetKey: text(),
    /** The organization affected, if any. */
    organizationId: uuid().references(() => organizations.id, { onDelete: 'restrict' }),
    before: jsonb(),
    after: jsonb(),
    reason: text().notNull(),
    metadata: jsonb(),
    ...timestamps,
  },
  (t) => [
    index('platform_audit_events_created_idx').on(t.createdAt.desc()),
    index('platform_audit_events_org_idx').on(t.organizationId, t.createdAt.desc()),
    index('platform_audit_events_target_idx').on(t.targetType, t.targetKey, t.createdAt.desc()),
  ],
)

/**
 * One row per organization: release group and plan version. Also the lock row for plan limit
 * checks; nothing references it, so locking it never blocks unrelated writes.
 */
export const organizationPlans = pgTable(
  'organization_plans',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    releaseGroup: releaseGroup().notNull().default('standard'),
    /** null = no plan. */
    planVersionId: uuid().references(() => planVersions.id, { onDelete: 'restrict' }),
    planAssignedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('organization_plans_org_unique').on(t.organizationId),
    index('organization_plans_plan_version_idx').on(t.planVersionId),
    check(
      'organization_plans_assigned_consistent',
      sql`(${t.planVersionId} is null) = (${t.planAssignedAt} is null)`,
    ),
  ],
)

export const organizationAddOns = pgTable(
  'organization_add_ons',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    addOnKey: text().notNull(),
    /** `{ ai_budget: "150000.00" }`. */
    limitIncreases: jsonb().notNull().default(sql`'{}'::jsonb`),
    startsAt: timestamptz().defaultNow().notNull(),
    endsAt: timestamptz(),
    reason: text().notNull(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    cancelledAt: timestamptz(),
    cancelledByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('organization_add_ons_active_unique')
      .on(t.organizationId, t.addOnKey)
      .where(sql`${t.cancelledAt} is null`),
    check(
      'organization_add_ons_ends_after_start',
      sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
    check(
      'organization_add_ons_increases_object',
      sql`jsonb_typeof(${t.limitIncreases}) = 'object'`,
    ),
    check('organization_add_ons_reason_length', sql`char_length(${t.reason}) >= 3`),
  ],
)

export const organizationTrials = pgTable(
  'organization_trials',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    planVersionId: uuid()
      .notNull()
      .references(() => planVersions.id, { onDelete: 'restrict' }),
    startsAt: timestamptz().defaultNow().notNull(),
    /** Last day of the trial, Lagos date. */
    endsOn: date({ mode: 'string' }).notNull(),
    /** Lagos midnight after endsOn: access ends exactly then, with no job. */
    expiresAt: timestamptz().notNull(),
    reason: text().notNull(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    cancelledAt: timestamptz(),
    cancelledByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    notifiedSevenDaysAt: timestamptz(),
    notifiedOneDayAt: timestamptz(),
    endedRecordedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    unique('organization_trials_org_id_unique').on(t.organizationId, t.id),
    index('organization_trials_org_idx').on(t.organizationId),
    index('organization_trials_open_idx')
      .on(t.expiresAt)
      .where(sql`${t.cancelledAt} is null and ${t.endedRecordedAt} is null`),
    check('organization_trials_expires_after_start', sql`${t.expiresAt} > ${t.startsAt}`),
    check('organization_trials_reason_length', sql`char_length(${t.reason}) >= 3`),
  ],
)

export const organizationOverrides = pgTable(
  'organization_overrides',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    kind: overrideKind().notNull(),
    /** A feature key (release, feature) or a limit key (limit). */
    key: text().notNull(),
    enabled: boolean(),
    /** `limit` only; null = unlimited. */
    limitValue: numeric({ precision: 14, scale: 2 }),
    reason: text().notNull(),
    expiresAt: timestamptz(),
    trialId: uuid(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    clearedAt: timestamptz(),
    clearedByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('organization_overrides_live_unique')
      .on(t.organizationId, t.kind, t.key)
      .where(sql`${t.clearedAt} is null`),
    index('organization_overrides_trial_idx').on(t.organizationId, t.trialId),
    foreignKey({
      name: 'organization_overrides_trial_fk',
      columns: [t.organizationId, t.trialId],
      foreignColumns: [organizationTrials.organizationId, organizationTrials.id],
    }),
    check(
      'organization_overrides_enabled_by_kind',
      sql`(${t.kind} in ('release', 'feature')) = (${t.enabled} is not null)`,
    ),
    check(
      'organization_overrides_limit_value_by_kind',
      sql`${t.kind} = 'limit' or ${t.limitValue} is null`,
    ),
    check(
      'organization_overrides_limit_value_non_negative',
      sql`${t.limitValue} is null or ${t.limitValue} >= 0`,
    ),
    check(
      'organization_overrides_trial_expires',
      sql`${t.trialId} is null or ${t.expiresAt} is not null`,
    ),
    check('organization_overrides_reason_length', sql`char_length(${t.reason}) >= 3`),
  ],
)
