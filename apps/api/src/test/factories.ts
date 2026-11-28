import { createHash } from 'node:crypto'
import type {
  ApprovalActionKey,
  NigerianState,
  ParcelStatus,
  PermissionSet,
  SystemRoleKey,
  TitleDocumentType,
  TitleStageStatus,
  TitleStageType,
} from '@vento/shared'
import {
  customRolePluralName,
  DEFAULT_ROLES,
  defaultPermissions,
  defaultStagesFor,
  normalisePermissions,
  PERMISSION_MODULES,
} from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, sql } from 'drizzle-orm'
import { loadMembership, type ServiceContext } from '@/access/context'
import { syncSystemRoles } from '@/access/system-roles'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  approvalRuleEntities,
  approvalRuleStepRoles,
  approvalRuleSteps,
  approvalRules,
  entities,
  featureReleases,
  files,
  invitationEntityLimits,
  invitations,
  memberEntityLimits,
  members,
  organizationAddOns,
  organizationOverrides,
  organizationPlans,
  organizations,
  parcels,
  passwordHistories,
  platformAdmins,
  rolePermissions,
  roles,
  sessions,
  staffInvitations,
  titleDocuments,
  titleDocumentVersions,
  titleStages,
  users,
} from '@/db/schema'
import { nextNumber } from '@/lib/counters'
import { newInvitationToken } from '@/modules/invitations/invitation-token'
import type { OverrideKind } from '@/platform/availability'
import { findPlanVersion } from '@/platform/operations/common'
import { seedPlans } from '@/platform/seed-plans'
import { availabilityForOrganization } from '@/platform/snapshot'
import { incomingKey, keptKey, type Storage } from '@/storage'
import { createMemoryStorage } from '@/storage/memory-driver'
import { uniqueEmail } from './db'

// Meets every password rule; apps/web/e2e signs up with the same literal.
export const TEST_PASSWORD = 'Parkview-gate-2026'

export type TestUser = typeof users.$inferSelect

export async function createUser(
  db: DbOrTx,
  overrides: Partial<typeof users.$inferInsert> & { password?: string } = {},
): Promise<TestUser> {
  const { password, ...fields } = overrides
  const [user] = await db
    .insert(users)
    .values({ name: 'Aisha Bello', email: uniqueEmail('aisha'), emailVerified: true, ...fields })
    .returning()
  if (!user) throw new Error('user insert failed')
  if (password) {
    const hash = await hashPassword(password)
    await db
      .insert(accounts)
      .values({ accountId: user.id, providerId: 'credential', userId: user.id, password: hash })
    await db.insert(passwordHistories).values({ userId: user.id, passwordHash: hash })
  }
  return user
}

export type TestOrg = {
  id: string
  name: string
  roleIds: Map<string, string>
  owner: TestUser
  ownerMemberId: string
}

/**
 * An organization with the nine roles and an owner (two-step on, so member procedures work).
 * It's `internal` (everything, no limits) unless a release group or plan is given, so tests
 * about other things never trip over availability.
 */
export async function createOrganization(
  db: DbOrTx,
  overrides: {
    name?: string
    owner?: TestUser
    releaseGroup?: 'standard' | 'pilot' | 'internal'
    /** `starter`, `growth` or `enterprise` (published if missing). */
    planKey?: string
  } = {},
): Promise<TestOrg> {
  const [org] = await db
    .insert(organizations)
    .values({ name: overrides.name ?? 'Vento Homes Ltd', headOfficeState: 'Lagos' })
    .returning()
  if (!org) throw new Error('org insert failed')
  let planVersionId: string | null = null
  if (overrides.planKey) {
    await seedPlans(db)
    planVersionId = (await findPlanVersion(db, overrides.planKey)).versionId
  }
  await db.insert(organizationPlans).values({
    organizationId: org.id,
    releaseGroup: overrides.releaseGroup ?? (overrides.planKey ? 'standard' : 'internal'),
    planVersionId,
    planAssignedAt: planVersionId ? new Date() : null,
  })
  const roleIds = await syncSystemRoles(db, org.id)
  const owner =
    overrides.owner ??
    (await createUser(db, {
      name: 'Olumide Bankole',
      email: uniqueEmail('olumide'),
      twoFactorEnabled: true,
    }))
  const [member] = await db
    .insert(members)
    .values({
      organizationId: org.id,
      userId: owner.id,
      roleId: roleIds.get('owner') ?? '',
      // Active now, so the hourly activity write doesn't show up in query counts.
      lastActiveAt: new Date(),
    })
    .returning()
  if (!member) throw new Error('member insert failed')
  return { id: org.id, name: org.name, roleIds, owner, ownerMemberId: member.id }
}

export async function createEntity(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  overrides: Partial<typeof entities.$inferInsert> = {},
) {
  const [row] = await db
    .insert(entities)
    .values({
      name: 'Parkview Residences SPV Ltd',
      type: 'spv',
      ...overrides,
      organizationId: org.id,
    })
    .returning()
  if (!row) throw new Error('entity insert failed')
  return row
}

const twoStepRoles = new Set(DEFAULT_ROLES.filter((r) => r.requiresTwoStep).map((r) => r.key))

/** A member with a built-in role, or a custom one by id. Roles that require two-step get it on. */
export async function createMember(
  db: DbOrTx,
  org: TestOrg,
  options: {
    role: SystemRoleKey
    /** A custom role's id; `role` then only names the person and their two-step. */
    roleId?: string
    entityIds?: string[]
    user?: TestUser
    name?: string
    /** Defaults to now; null for someone who never came back after joining. */
    lastActiveAt?: Date | null
  },
) {
  const user =
    options.user ??
    (await createUser(db, {
      name: options.name ?? `${options.role} person`,
      email: uniqueEmail(options.role),
      twoFactorEnabled: twoStepRoles.has(options.role),
    }))
  const [member] = await db
    .insert(members)
    .values({
      organizationId: org.id,
      userId: user.id,
      roleId: options.roleId ?? org.roleIds.get(options.role) ?? '',
      lastActiveAt: options.lastActiveAt === undefined ? new Date() : options.lastActiveAt,
    })
    .returning()
  if (!member) throw new Error('member insert failed')
  if (options.entityIds?.length) {
    await db.insert(memberEntityLimits).values(
      options.entityIds.map((entityId) => ({
        organizationId: org.id,
        memberId: member.id,
        entityId,
      })),
    )
  }
  return { user, member }
}

export async function createInvitation(
  db: DbOrTx,
  org: TestOrg,
  options: {
    role: SystemRoleKey
    /** A custom role's id instead of the built-in one. */
    roleId?: string
    email?: string
    status?: (typeof invitations.$inferInsert)['status']
    expiresAt?: Date
    entityIds?: string[]
    /** Defaults to 5 minutes ago, so a resend isn't caught by the once-a-minute rule. */
    lastSentAt?: Date
    delivery?: (typeof invitations.$inferInsert)['delivery']
    invitedBy?: TestUser
  },
) {
  const { token, tokenHash } = newInvitationToken()
  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: org.id,
      email: options.email ?? uniqueEmail('invitee'),
      roleId: options.roleId ?? org.roleIds.get(options.role) ?? '',
      invitedByUserId: (options.invitedBy ?? org.owner).id,
      status: options.status ?? 'pending',
      tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600_000),
      lastSentAt: options.lastSentAt ?? new Date(Date.now() - 5 * 60_000),
      delivery: options.delivery ?? 'sent',
    })
    .returning()
  if (!invitation) throw new Error('invitation insert failed')
  if (options.entityIds?.length) {
    await db.insert(invitationEntityLimits).values(
      options.entityIds.map((entityId) => ({
        organizationId: org.id,
        invitationId: invitation.id,
        entityId,
      })),
    )
  }
  return { invitation, token }
}

export async function createSession(
  db: DbOrTx,
  user: TestUser,
  overrides: Partial<typeof sessions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      token: `t-${Math.random().toString(36).slice(2)}${Date.now()}`,
      expiresAt: new Date(Date.now() + 12 * 3600_000),
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('session insert failed')
  return row
}

/** The service context a signed-in member gets, loaded the same way the middleware does. */
export async function contextFor(
  db: DbOrTx,
  user: TestUser,
  org: Pick<TestOrg, 'id'>,
  storage: Storage = createMemoryStorage(),
): Promise<ServiceContext> {
  const membership = await loadMembership(db, user.id, org.id)
  if (!membership || membership.organizationId !== org.id) throw new Error('not a member')
  return {
    db,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    user: { id: user.id, name: user.name, email: user.email },
    member: membership.member,
    sessionId: null,
    features: await availabilityForOrganization(db, membership.organizationId),
    storage,
  }
}

/** Sets a flag's release stage for everyone (inside the test's transaction only). */
export async function setStage(
  db: DbOrTx,
  key: string,
  stage: 'off' | 'internal' | 'pilot' | 'on',
): Promise<void> {
  await db
    .insert(featureReleases)
    .values({ featureKey: key, stage, reason: 'test' })
    .onConflictDoUpdate({ target: featureReleases.featureKey, set: { stage } })
}

/** A live override for one organization, without going through the commands. */
export async function setOverride(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  input: {
    kind: OverrideKind
    key: string
    enabled?: boolean
    limitValue?: string | null
    expiresAt?: Date | null
  },
): Promise<void> {
  await db.insert(organizationOverrides).values({
    organizationId: org.id,
    kind: input.kind,
    key: input.key,
    enabled: input.kind === 'limit' ? null : (input.enabled ?? true),
    limitValue: input.kind === 'limit' ? (input.limitValue ?? null) : null,
    expiresAt: input.expiresAt ?? null,
    reason: 'test',
  })
}

export async function addAddOnRow(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  input: { addOnKey?: string; budget?: string } = {},
): Promise<void> {
  await db.insert(organizationAddOns).values({
    organizationId: org.id,
    addOnKey: input.addOnKey ?? 'ai',
    limitIncreases: { ai_budget: input.budget ?? '150000.00' },
    reason: 'test',
  })
}

export async function reloadUser(db: DbOrTx, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}

/**
 * A Vento Real Estate super-admin: an active staff account (two-step on unless overridden).
 * `revoked` leaves only a revoked row. Staff are never members (decision 0023).
 */
export async function createSuperAdmin(
  db: DbOrTx,
  overrides: Partial<typeof users.$inferInsert> & { password?: string } = {},
  options: { revoked?: boolean } = {},
): Promise<TestUser> {
  const user = await createUser(db, {
    name: 'Ada Okafor',
    email: uniqueEmail('ada'),
    twoFactorEnabled: true,
    ...overrides,
    accountKind: 'staff',
  })
  await db.insert(platformAdmins).values({
    userId: user.id,
    reason: 'test',
    ...(options.revoked && { revokedAt: new Date() }),
  })
  return user
}

export type StaffInvitationState = 'pending' | 'expired' | 'withdrawn' | 'accepted'

/**
 * A staff invitation (and its token). `started` links a joining staff account with a password, as
 * `join.start` leaves it; `accepted` makes that account an active super-admin.
 */
export async function createStaffInvitation(
  db: DbOrTx,
  options: {
    status?: StaffInvitationState
    started?: boolean
    invitedBy?: TestUser | null
    email?: string
    name?: string
    lastSentAt?: Date
  } = {},
): Promise<{ id: string; token: string; email: string; name: string; user: TestUser | null }> {
  const status = options.status ?? 'pending'
  const email = options.email ?? uniqueEmail('tunde')
  const name = options.name ?? 'Tunde Bello'
  const now = Date.now()
  const { token, tokenHash } = newInvitationToken()
  const started = options.started || status === 'accepted'
  const user = started
    ? await createUser(db, {
        name,
        email,
        accountKind: 'staff',
        password: TEST_PASSWORD,
        twoFactorEnabled: status === 'accepted',
      })
    : null
  const [row] = await db
    .insert(staffInvitations)
    .values({
      email,
      name,
      reason: 'Joins the release rota',
      invitedByUserId: options.invitedBy?.id ?? null,
      // No inviter means the bootstrap invitation, as in real data.
      bootstrap: !options.invitedBy,
      status: status === 'expired' ? 'pending' : status,
      tokenHash,
      expiresAt: new Date(status === 'expired' ? now - 60_000 : now + 48 * 60 * 60_000),
      lastSentAt: options.lastSentAt ?? new Date(now - 2 * 60_000),
      userId: user?.id ?? null,
      startedAt: user ? new Date(now - 60_000) : null,
      respondedAt: status === 'accepted' || status === 'withdrawn' ? new Date(now) : null,
    })
    .returning({ id: staffInvitations.id })
  if (!row) throw new Error('staff invitation insert failed')
  if (status === 'accepted' && user) {
    await db.insert(platformAdmins).values({ userId: user.id, reason: 'Joins the release rota' })
  }
  return { id: row.id, token, email, name, user }
}

/**
 * A staff account in a given state: `active` (a super-admin), `joining` (a started, pending
 * invitation) or `closed` (a removed super-admin: revoked row, no password, no two-step).
 */
export async function createStaffAccount(
  db: DbOrTx,
  options: {
    state?: 'active' | 'joining' | 'closed'
    twoFactorEnabled?: boolean
    name?: string
  } = {},
): Promise<TestUser> {
  const state = options.state ?? 'active'
  if (state === 'joining') {
    const { user } = await createStaffInvitation(db, { started: true, name: options.name })
    if (!user) throw new Error('joining account missing')
    return user
  }
  if (state === 'closed') {
    return createSuperAdmin(
      db,
      { twoFactorEnabled: false, ...(options.name && { name: options.name }) },
      { revoked: true },
    )
  }
  return createSuperAdmin(db, {
    twoFactorEnabled: options.twoFactorEnabled ?? true,
    password: TEST_PASSWORD,
    ...(options.name && { name: options.name }),
  })
}

/**
 * A custom role, straight into the tables (the roles service is what's under test elsewhere).
 * Permissions are normalised (any action adds view).
 */
export async function createCustomRole(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  options: {
    name?: string
    permissions: Partial<PermissionSet>
    requiresTwoStep?: boolean
    archivedAt?: Date
  },
) {
  const name = options.name ?? 'Site engineer'
  const [role] = await db
    .insert(roles)
    .values({
      organizationId: org.id,
      key: null,
      isSystem: false,
      name,
      pluralName: customRolePluralName(name),
      description: 'Based on Project manager',
      requiresTwoStep: options.requiresTwoStep ?? false,
      archivedAt: options.archivedAt ?? null,
    })
    .returning()
  if (!role) throw new Error('role insert failed')
  const set = normalisePermissions(options.permissions)
  const rows = PERMISSION_MODULES.flatMap((module) =>
    set[module].map((action) => ({ organizationId: org.id, roleId: role.id, module, action })),
  )
  if (rows.length) await db.insert(rolePermissions).values(rows)
  return role
}

/** Archives an entity the way the service does, by someone. */
export async function archiveEntityRow(
  db: DbOrTx,
  entity: { id: string },
  by: Pick<TestUser, 'id'> | null = null,
) {
  const [row] = await db
    .update(entities)
    .set({ status: 'archived', archivedAt: new Date(), archivedByUserId: by?.id ?? null })
    .where(eq(entities.id, entity.id))
    .returning()
  if (!row) throw new Error('entity archive failed')
  return row
}

/**
 * The ceiling's standard case: a custom "Office manager" with Settings create, edit and delete
 * plus everything Sales has, and no Finance or HR (two-step on, as the role requires it).
 */
export async function createOfficeManager(db: DbOrTx, org: TestOrg, user?: TestUser) {
  const permissions = defaultPermissionsFor('sales')
  permissions.settings = ['view', 'create', 'edit', 'delete']
  const role = await createCustomRole(db, org, {
    name: 'Office manager',
    permissions,
    requiresTwoStep: true,
  })
  const holder = await createMember(db, org, {
    role: 'admin',
    roleId: role.id,
    name: 'Ngozi Eze',
    ...(user && { user }),
  })
  return { role, ...holder }
}

function defaultPermissionsFor(key: SystemRoleKey): PermissionSet {
  const role = DEFAULT_ROLES.find((r) => r.key === key)
  if (!role) throw new Error(`Unknown role ${key}`)
  return defaultPermissions(role)
}

/**
 * An approval rule straight into the tables. Steps name built-in role keys or role ids; `entities`
 * defaults to all companies. Returns the rule's id.
 */
export async function createApprovalRule(
  db: DbOrTx,
  org: TestOrg,
  options: {
    actionKey?: ApprovalActionKey
    steps: string[][]
    entityIds?: string[] | 'all'
    minAmount?: string | null
    createdByMemberId?: string
  },
): Promise<string> {
  const entityIds = options.entityIds ?? 'all'
  const [rule] = await db
    .insert(approvalRules)
    .values({
      organizationId: org.id,
      actionKey: options.actionKey ?? 'access.role.update',
      minAmount: options.minAmount ?? null,
      appliesToAll: entityIds === 'all',
      createdByMemberId: options.createdByMemberId ?? org.ownerMemberId,
    })
    .returning({ id: approvalRules.id })
  if (!rule) throw new Error('approval rule insert failed')
  for (const [i, step] of options.steps.entries()) {
    const [row] = await db
      .insert(approvalRuleSteps)
      .values({ organizationId: org.id, ruleId: rule.id, position: i + 1 })
      .returning({ id: approvalRuleSteps.id })
    if (!row) throw new Error('approval rule step insert failed')
    await db.insert(approvalRuleStepRoles).values(
      step.map((role) => ({
        organizationId: org.id,
        stepId: row.id,
        roleId: org.roleIds.get(role) ?? role,
      })),
    )
  }
  if (entityIds !== 'all') {
    await db
      .insert(approvalRuleEntities)
      .values(entityIds.map((entityId) => ({ organizationId: org.id, ruleId: rule.id, entityId })))
  }
  return rule.id
}

/** A small real PDF's first bytes, enough for the content check. */
export const SAMPLE_PDF = new TextEncoder().encode('%PDF-1.7\n% Fictional sample\n%%EOF\n')

/**
 * A finished, checked upload (status ready, not attached), as `files.completeUpload` leaves it.
 * Pass `storage` to put the bytes in the bucket too; `attached` marks it held by a record;
 * `createdAt` back-dates it for the sweep.
 */
export async function createReadyFile(
  db: DbOrTx,
  org: Pick<TestOrg, 'id'>,
  options: {
    uploadedBy: Pick<TestUser, 'id'>
    storage?: Storage
    bytes?: Uint8Array
    attached?: boolean
    createdAt?: Date
    /** Defaults to `createdAt`. */
    completedAt?: Date
    originalName?: string
  },
) {
  const bytes = options.bytes ?? SAMPLE_PDF
  const [idRow] = (await db.execute<{ id: string }>(sql`select uuidv7() as id`)).rows
  if (!idRow) throw new Error('uuidv7() returned nothing')
  // An attached file lives under kept/ (as attachFile leaves it); a free one under incoming/.
  const key = options.attached ? keptKey(org.id, idRow.id) : incomingKey(org.id, idRow.id)
  const [row] = await db
    .insert(files)
    .values({
      id: idRow.id,
      organizationId: org.id,
      purpose: 'title_document',
      status: 'ready',
      objectKey: key,
      originalName: options.originalName ?? 'Survey plan.pdf',
      declaredType: 'application/pdf',
      contentType: 'application/pdf',
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      uploadedByUserId: options.uploadedBy.id,
      completedAt: options.completedAt ?? options.createdAt ?? new Date(),
      attachedAt: options.attached ? new Date() : null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning()
  if (!row) throw new Error('file insert failed')
  if (options.storage) await options.storage.putObject(key, bytes, 'application/pdf')
  return row
}

type StageSeed =
  | TitleStageType
  | {
      type: TitleStageType
      status?: TitleStageStatus
      statusOn?: string | null
      note?: string | null
      followUpOn?: string | null
      reference?: string | null
      issuedBy?: string | null
      updatedBy?: Pick<TestUser, 'id'>
    }

/**
 * A parcel with its stages, written straight to the tables (no audit), with the next reference.
 * Defaults: Plot 22, Folu Ayo in Ibeju-Lekki, Lagos, 4.20 ha, under acquisition, under a new
 * company, the state's default stages not started. Statuses are taken as given (no titled check).
 */
export async function createParcel(
  db: DbOrTx,
  org: Pick<TestOrg, 'id' | 'owner'>,
  options: {
    entityId?: string
    name?: string
    state?: NigerianState
    lga?: string
    area?: string | null
    sizeSqm?: string
    status?: ParcelStatus
    acquiredOn?: string | null
    acquisitionCost?: string | null
    seller?: string | null
    stages?: StageSeed[]
    archived?: boolean
  } = {},
) {
  const entityId = options.entityId ?? (await createEntity(db, org)).id
  const state = options.state ?? 'Lagos'
  const sizeSqm = options.sizeSqm ?? '42000.00'
  const [parcel] = await db
    .insert(parcels)
    .values({
      organizationId: org.id,
      entityId,
      referenceNumber: await nextNumber(db, org.id, 'parcel'),
      name: options.name ?? 'Plot 22, Folu Ayo',
      state,
      lga: options.lga ?? (state === 'FCT' ? 'Abuja Municipal' : 'Ibeju-Lekki'),
      area: options.area === undefined ? 'Ibeju-Lekki' : options.area,
      sizeSqm,
      sizeUnit: 'sqm',
      sizeEntered: sizeSqm,
      status: options.status ?? 'under_acquisition',
      acquiredOn: options.acquiredOn ?? null,
      acquisitionCost: options.acquisitionCost ?? null,
      seller: options.seller ?? null,
      archivedAt: options.archived ? new Date() : null,
      archivedByUserId: options.archived ? org.owner.id : null,
    })
    .returning()
  if (!parcel) throw new Error('parcel insert failed')
  const seeds = (options.stages ?? defaultStagesFor(state)).map((s) =>
    typeof s === 'string' ? { type: s } : s,
  )
  const stages = await db
    .insert(titleStages)
    .values(
      seeds.map((s) => ({
        organizationId: org.id,
        parcelId: parcel.id,
        type: s.type,
        status: s.status ?? 'not_started',
        statusOn: s.statusOn ?? null,
        note: s.note ?? null,
        followUpOn: s.followUpOn ?? null,
        reference: s.reference ?? null,
        issuedBy: s.issuedBy ?? null,
        updatedByUserId: (s.updatedBy ?? org.owner).id,
      })),
    )
    .returning()
  const stageOf = (type: TitleStageType) => {
    const found = stages.find((s) => s.type === type)
    if (!found) throw new Error(`parcel has no ${type} stage`)
    return found
  }
  return { ...parcel, stages, stageOf }
}

/**
 * A document version in a parcel's vault, on an attached file (bytes in `storage` when given).
 * A second call with the same type (and name) adds the next version, as an upload does.
 */
export async function createTitleDocument(
  db: DbOrTx,
  org: Pick<TestOrg, 'id' | 'owner'>,
  parcel: { id: string },
  options: {
    type: TitleDocumentType
    name?: string | null
    uploadedBy?: Pick<TestUser, 'id'>
    storage?: Storage
    issuedOn?: string | null
    /** Removed with this reason (hidden from the vault). */
    removedReason?: string
  },
) {
  const uploadedBy = options.uploadedBy ?? org.owner
  const name = options.name ?? (options.type === 'other' ? 'Query letter' : null)
  const file = await createReadyFile(db, org, {
    uploadedBy,
    attached: true,
    ...(options.storage && { storage: options.storage }),
  })
  const [existing] = await db
    .select()
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.parcelId, parcel.id),
        eq(titleDocuments.type, options.type),
        sql`lower(coalesce(${titleDocuments.name}, '')) = lower(${name ?? ''})`,
      ),
    )
  const document =
    existing ??
    (
      await db
        .insert(titleDocuments)
        .values({
          organizationId: org.id,
          parcelId: parcel.id,
          type: options.type,
          name,
          createdByUserId: uploadedBy.id,
        })
        .returning()
    )[0]
  if (!document) throw new Error('title document insert failed')
  const [last] = await db
    .select({ n: sql<number>`coalesce(max(${titleDocumentVersions.versionNo}), 0)::int` })
    .from(titleDocumentVersions)
    .where(eq(titleDocumentVersions.documentId, document.id))
  const [version] = await db
    .insert(titleDocumentVersions)
    .values({
      organizationId: org.id,
      documentId: document.id,
      versionNo: (last?.n ?? 0) + 1,
      fileId: file.id,
      issuedOn: options.issuedOn ?? null,
      uploadedByUserId: uploadedBy.id,
      ...(options.removedReason && {
        removedAt: new Date(),
        removedByUserId: uploadedBy.id,
        removedReason: options.removedReason,
      }),
    })
    .returning()
  if (!version) throw new Error('title document version insert failed')
  return { document, version, file }
}
