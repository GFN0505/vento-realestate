import type {
  listMembersInput,
  Member,
  SystemRoleKey,
  updateMemberAccessInput,
} from '@vento/shared'
import { and, asc, count, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import {
  entities,
  memberEntityLimits,
  members,
  roles,
  sessions,
  twoFactors,
  users,
} from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { twoStepResetAlert } from '@/email/templates/security-alert'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { pageOffset, toPage } from '@/lib/paginate'
import { recordAccountEvent, recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'

const isOwnerKey = (key: string | null) => key === 'owner'

export async function listMembers(ctx: ServiceContext, input: z.output<typeof listMembersInput>) {
  return queryMembers(
    ctx,
    input,
    and(
      eq(members.organizationId, ctx.organizationId),
      input.status ? eq(members.status, input.status) : undefined,
    ),
  )
}

async function queryMembers(
  ctx: ServiceContext,
  input: z.output<typeof listMembersInput>,
  where: SQL | undefined,
) {
  const { limit, offset } = pageOffset(input)
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select({
        id: members.id,
        userId: members.userId,
        name: users.name,
        email: users.email,
        twoFactorEnabled: users.twoFactorEnabled,
        status: members.status,
        joinedAt: members.joinedAt,
        removedAt: members.removedAt,
        roleId: roles.id,
        roleKey: roles.key,
        roleName: roles.name,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .innerJoin(
        roles,
        and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
      )
      .where(where)
      .orderBy(asc(users.name), asc(members.id))
      .limit(limit)
      .offset(offset),
    ctx.db.select({ n: count() }).from(members).where(where),
  ])
  const limits = rows.length
    ? await ctx.db
        .select({ memberId: memberEntityLimits.memberId, id: entities.id, name: entities.name })
        .from(memberEntityLimits)
        .innerJoin(entities, eq(entities.id, memberEntityLimits.entityId))
        .where(
          and(
            eq(memberEntityLimits.organizationId, ctx.organizationId),
            inArray(
              memberEntityLimits.memberId,
              rows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(asc(entities.name))
    : []
  const items: Member[] = rows.map((r) => {
    const own = limits.filter((l) => l.memberId === r.id).map(({ id, name }) => ({ id, name }))
    return {
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: { id: r.roleId, key: r.roleKey as SystemRoleKey | null, name: r.roleName },
      entities: own.length ? own : null,
      twoFactorEnabled: r.twoFactorEnabled,
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
      removedAt: r.removedAt?.toISOString() ?? null,
    }
  })
  return toPage(items, input, total?.n ?? 0)
}

type Target = {
  id: string
  userId: string
  name: string
  email: string
  roleId: string
  roleKey: string | null
  roleName: string
}

/** An active member of this organization, locked for the change. Anything else is not found. */
async function lockTarget(tx: DbOrTx, ctx: ServiceContext, memberId: string): Promise<Target> {
  const [row] = await tx
    .select({
      id: members.id,
      userId: members.userId,
      name: users.name,
      email: users.email,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, ctx.organizationId),
        eq(members.id, memberId),
        eq(members.status, 'active'),
      ),
    )
    .for('update', { of: members })
  if (!row) throw notFound()
  return row
}

function assertNotSelf(ctx: ServiceContext, target: Target, message: string) {
  if (target.userId === ctx.user.id) throw forbidden('own_access', message)
}

function assertOwnerRules(ctx: ServiceContext, involvesOwner: boolean, message: string) {
  if (involvesOwner && !isOwnerKey(ctx.member.roleKey)) throw forbidden('owner_only', message)
}

async function otherActiveOwners(tx: DbOrTx, ctx: ServiceContext, exceptMemberId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(members)
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, ctx.organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
        ne(members.id, exceptMemberId),
      ),
    )
  return row?.n ?? 0
}

const lastOwnerMessage = (ctx: ServiceContext) =>
  `${ctx.organizationName} needs at least one owner. Make someone else an owner first.`

async function currentLimits(tx: DbOrTx, ctx: ServiceContext, memberId: string) {
  return tx
    .select({ id: entities.id, name: entities.name })
    .from(memberEntityLimits)
    .innerJoin(entities, eq(entities.id, memberEntityLimits.entityId))
    .where(
      and(
        eq(memberEntityLimits.organizationId, ctx.organizationId),
        eq(memberEntityLimits.memberId, memberId),
      ),
    )
    .orderBy(asc(entities.name))
}

/**
 * Entities a granter may put in a limit (member update or invitation). They must be this
 * organization's, and a granter limited to some entities can only grant within them: they
 * can't give "all entities", and an entity outside their limit is not found, as everywhere.
 */
export async function assertGrantableEntities(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
  entityIds: string[] | null,
) {
  const granterLimit = ctx.member.entityIds
  if (granterLimit !== null) {
    if (entityIds === null) {
      throw forbidden(
        'entity_limit',
        'You can only give access to the entities you can see. Choose them instead of all entities.',
      )
    }
    if (entityIds.some((id) => !granterLimit.includes(id))) throw notFound()
  }
  if (!entityIds) return []
  const unique = [...new Set(entityIds)]
  const rows = await tx
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.organizationId, ctx.organizationId), inArray(entities.id, unique)))
  if (rows.length !== unique.length) throw notFound()
  return rows
}

export async function updateMemberAccess(
  ctx: ServiceContext,
  input: z.output<typeof updateMemberAccessInput>,
): Promise<{ notice: string; member: Member }> {
  const result = await ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const target = await lockTarget(tx, ctx, input.memberId)
    assertNotSelf(ctx, target, "You can't change your own access. Ask another owner or admin.")
    const [role] = await tx
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(and(eq(roles.organizationId, ctx.organizationId), eq(roles.id, input.roleId)))
    if (!role) throw notFound()
    assertOwnerRules(
      ctx,
      isOwnerKey(target.roleKey) || isOwnerKey(role.key),
      isOwnerKey(role.key)
        ? 'Only owners can make someone an owner.'
        : "Only owners can change an owner's access.",
    )
    if (isOwnerKey(target.roleKey) && !isOwnerKey(role.key)) {
      if ((await otherActiveOwners(tx, ctx, target.id)) < 1) {
        throw conflict('last_owner', lastOwnerMessage(ctx))
      }
    }
    const newLimits = await assertGrantableEntities(tx, ctx, input.entityIds)
    const before = await currentLimits(tx, ctx, target.id)

    await tx.update(members).set({ roleId: role.id }).where(eq(members.id, target.id))
    await tx.delete(memberEntityLimits).where(eq(memberEntityLimits.memberId, target.id))
    if (newLimits.length) {
      await tx.insert(memberEntityLimits).values(
        newLimits.map((e) => ({
          organizationId: ctx.organizationId,
          memberId: target.id,
          entityId: e.id,
        })),
      )
    }
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'member.access_changed',
      actor: actorOf(ctx),
      target: { type: 'member', id: target.id, label: target.name },
      before: {
        role: target.roleName,
        entities: before.length ? before.map((e) => e.name) : 'all',
      },
      after: {
        role: role.name,
        entities: newLimits.length ? newLimits.map((e) => e.name).sort() : 'all',
      },
    })
    const notice =
      role.id === target.roleId
        ? `Access updated for ${target.name}`
        : `${target.name} is now ${role.name}`
    return { notice, memberId: target.id }
  })
  const { items } = await queryMembers(
    ctx,
    { page: 1, pageSize: 1 },
    and(eq(members.organizationId, ctx.organizationId), eq(members.id, result.memberId)),
  )
  const [member] = items
  if (!member) throw notFound()
  return { notice: result.notice, member }
}

export async function removeMember(
  ctx: ServiceContext,
  memberId: string,
): Promise<{ notice: string }> {
  return ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const target = await lockTarget(tx, ctx, memberId)
    assertNotSelf(ctx, target, "You can't change your own access. Ask another owner or admin.")
    assertOwnerRules(ctx, isOwnerKey(target.roleKey), 'Only owners can remove an owner.')
    if (isOwnerKey(target.roleKey) && (await otherActiveOwners(tx, ctx, target.id)) < 1) {
      throw conflict('last_owner', lastOwnerMessage(ctx))
    }
    await tx
      .update(members)
      .set({ status: 'removed', removedAt: new Date() })
      .where(eq(members.id, target.id))
    // Their sessions in this organization end at once; sessions in their other organizations stay.
    const ended = await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, target.userId),
          or(
            eq(sessions.activeOrganizationId, ctx.organizationId),
            isNull(sessions.activeOrganizationId),
          ),
        ),
      )
      .returning({ id: sessions.id })
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'member.removed',
      actor: actorOf(ctx),
      target: { type: 'member', id: target.id, label: target.name },
      before: { status: 'active', role: target.roleName },
      after: { status: 'removed' },
    })
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'session.revoked_by_removal',
      actor: actorOf(ctx),
      target: { type: 'user', id: target.userId, label: target.name },
      metadata: { count: ended.length },
    })
    return { notice: `${target.name} removed. History kept.` }
  })
}

/**
 * For a lost phone and lost backup codes. Two-step is per person, so this affects every
 * organization they belong to; it's recorded in each and they get a security alert.
 */
/**
 * For a lost phone and lost backup codes. Two-step is per person, so this reaches every
 * organization they belong to. A reset alone must never open the account to whoever asked
 * for it (an admin elsewhere, or someone who knows the password): every session ends and
 * sign-in stays refused until the person sets a new password from the emailed link. The
 * router sends that link and the security alert after commit.
 */
export async function resetMemberTwoStep(
  ctx: ServiceContext,
  memberId: string,
): Promise<{ notice: string; emails: EmailMessage[]; resetPasswordFor: string }> {
  return ctx.db.transaction(async (tx) => {
    const target = await lockTarget(tx, ctx, memberId)
    assertNotSelf(ctx, target, "You can't reset your own two-step. Ask another owner or admin.")
    assertOwnerRules(ctx, isOwnerKey(target.roleKey), "Only owners can reset an owner's two-step.")
    await tx.delete(twoFactors).where(eq(twoFactors.userId, target.userId))
    await tx
      .update(users)
      .set({ twoFactorEnabled: false, twoStepSetupRequired: true, passwordResetRequired: true })
      .where(eq(users.id, target.userId))
    const ended = await tx
      .delete(sessions)
      .where(eq(sessions.userId, target.userId))
      .returning({ id: sessions.id })
    await recordAccountEvent(tx, {
      userId: target.userId,
      action: 'two_step.reset',
      actor: actorOf(ctx),
      target: { type: 'user', id: target.userId, label: target.name },
      metadata: { resetFrom: ctx.organizationName, sessionsEnded: ended.length },
    })
    const alert = twoStepResetAlert({ byName: ctx.user.name })
    return {
      notice: `Two-step reset for ${target.name}. We've emailed them a link to set a new password.`,
      emails: [{ to: target.email, tag: 'security_alert', ...alert }],
      resetPasswordFor: target.email,
    }
  })
}
