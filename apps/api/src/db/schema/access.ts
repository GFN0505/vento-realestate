import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps, timestamptz } from '../columns'
import { users } from './auth'
import { entities, organizations } from './organization'

export const permissionModule = pgEnum('permission_module', [
  'land',
  'projects',
  'sales',
  'finance',
  'facility',
  'hr',
  'compliance',
  'documents',
  'analytics',
  'settings',
])
export const permissionAction = pgEnum('permission_action', [
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'approve',
])

export const roles = pgTable(
  'roles',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** `owner` … `viewer` for the built-in roles; null for custom roles (brick 3). */
    key: text(),
    name: text().notNull(),
    pluralName: text().notNull(),
    description: text().notNull().default(''),
    isSystem: boolean().notNull().default(false),
    requiresTwoStep: boolean().notNull().default(false),
    /** Bumped on every save (optimistic concurrency). Any cache of permissions keys on it. */
    version: integer().notNull().default(1),
    /** A deleted custom role that history still refers to: hidden, its name free again. */
    archivedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    unique('roles_org_id_unique').on(t.organizationId, t.id),
    uniqueIndex('roles_org_key_unique')
      .on(t.organizationId, t.key)
      .where(sql`${t.key} is not null`),
    uniqueIndex('roles_org_name_unique')
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('roles_version_positive', sql`${t.version} >= 1`),
    check('roles_system_key_consistent', sql`(${t.key} is null) = (not ${t.isSystem})`),
    check('roles_archived_custom_only', sql`${t.archivedAt} is null or not ${t.isSystem}`),
  ],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: id(),
    organizationId: uuid().notNull(),
    roleId: uuid().notNull(),
    module: permissionModule().notNull(),
    action: permissionAction().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('role_permissions_unique').on(t.roleId, t.module, t.action),
    index('role_permissions_org_idx').on(t.organizationId),
    foreignKey({
      name: 'role_permissions_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }).onDelete('cascade'),
  ],
)

export const memberStatus = pgEnum('member_status', ['active', 'removed'])

export const members = pgTable(
  'members',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    roleId: uuid().notNull(),
    status: memberStatus().notNull().default('active'),
    joinedAt: timestamptz().defaultNow().notNull(),
    removedAt: timestamptz(),
    /** Who removed them (null while active, and for removals before this was kept). */
    removedByUserId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    /** Written at most hourly from the request path (MEMBER_ACTIVITY_WRITE_INTERVAL_MS). */
    lastActiveAt: timestamptz(),
    /** Setup checklist on Home, per person per organization ("every device"). */
    checklistHiddenAt: timestamptz(),
    /** First seen all done; the card goes the next Lagos day. Cleared when an item reopens. */
    checklistCompletedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    unique('members_org_id_unique').on(t.organizationId, t.id),
    uniqueIndex('members_org_user_active_unique')
      .on(t.organizationId, t.userId)
      .where(sql`${t.status} = 'active'`),
    index('members_user_id_idx').on(t.userId),
    index('members_org_status_idx').on(t.organizationId, t.status),
    index('members_org_role_idx').on(t.organizationId, t.roleId),
    foreignKey({
      name: 'members_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }),
    check(
      'members_removed_consistent',
      sql`(${t.status} = 'removed') = (${t.removedAt} is not null)`,
    ),
    index('members_removed_by_idx').on(t.removedByUserId),
    check(
      'members_removed_by_only_removed',
      sql`${t.removedByUserId} is null or ${t.status} = 'removed'`,
    ),
  ],
)

export const memberEntityLimits = pgTable(
  'member_entity_limits',
  {
    id: id(),
    organizationId: uuid().notNull(),
    memberId: uuid().notNull(),
    entityId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('member_entity_limits_unique').on(t.memberId, t.entityId),
    index('member_entity_limits_org_entity_idx').on(t.organizationId, t.entityId),
    foreignKey({
      name: 'member_entity_limits_member_fk',
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'member_entity_limits_entity_fk',
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.id],
    }).onDelete('restrict'),
  ],
)

export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'declined',
  'expired',
  'withdrawn',
])

/**
 * Whether the email arrived, apart from the invitation's status: queued at insert or resend,
 * then what the mailer (or, in PR B, Postmark's bounce webhook) reports. Never audited.
 */
export const invitationDelivery = pgEnum('invitation_delivery', [
  'queued',
  'sent',
  'failed',
  'bounced',
  'complained',
])

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    roleId: uuid().notNull(),
    invitedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: invitationStatus().notNull().default('pending'),
    /** SHA-256 of the emailed token; the token itself is never stored. */
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    lastSentAt: timestamptz().defaultNow().notNull(),
    respondedAt: timestamptz(),
    acceptedUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    delivery: invitationDelivery().notNull().default('queued'),
    deliveryChangedAt: timestamptz(),
    /** The provider's id for the latest send; a bounce for an older send must not match. */
    deliveryMessageId: text(),
    ...timestamps,
  },
  (t) => [
    unique('invitations_org_id_unique').on(t.organizationId, t.id),
    uniqueIndex('invitations_token_hash_unique').on(t.tokenHash),
    uniqueIndex('invitations_org_email_pending_unique')
      .on(t.organizationId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index('invitations_org_status_idx').on(t.organizationId, t.status, t.createdAt.desc()),
    index('invitations_invited_by_idx').on(t.invitedByUserId),
    foreignKey({
      name: 'invitations_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }),
    check('invitations_email_lower_case', sql`${t.email} = lower(${t.email})`),
  ],
)

export const invitationEntityLimits = pgTable(
  'invitation_entity_limits',
  {
    id: id(),
    organizationId: uuid().notNull(),
    invitationId: uuid().notNull(),
    entityId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invitation_entity_limits_unique').on(t.invitationId, t.entityId),
    index('invitation_entity_limits_org_entity_idx').on(t.organizationId, t.entityId),
    foreignKey({
      name: 'invitation_entity_limits_invitation_fk',
      columns: [t.organizationId, t.invitationId],
      foreignColumns: [invitations.organizationId, invitations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'invitation_entity_limits_entity_fk',
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.id],
    }).onDelete('restrict'),
  ],
)
