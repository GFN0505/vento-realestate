import type { TeamMemberRow, updateMemberAccessInput } from '@vento/shared'
import { and, asc, count, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { type MemberAction, memberRefusal, needsOwnerName, viewerOf } from '@/access/manage-rules'
import { firstOwner } from '@/access/who-can-grant'
import { webUrl } from '@/auth/hooks/deps'
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
import { newOwnerAlert, twoStepResetAlert } from '@/email/templates/security-alert'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import { recordAccountEvent, recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'
import { memberRowById } from '@/modules/team/team.service'

const isOwnerKey = (key: string | null) => key === 'owner'

type Target = {
  id: string
  userId: string
  name: string
  email: string
  roleId: string
  roleKey: string | null
  roleName: string
  /** Current entity limits, by name; empty = all entities. */
  limits: { id: string; name: string }[]
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
  return { ...row, limits: await currentLimits(tx, ctx, row.id) }
}

/**
 * Throws the manage rules' refusal (own access, owner only, wider access), if any. The owner's
 * name for "Ask … (owner)" is looked up only when the target's access is wider than the viewer's.
 */
async function assertMayManage(
  tx: DbOrTx,
  ctx: ServiceContext,
  target: Target,
  action: MemberAction,
  newRoleKey?: string | null,
): Promise<void> {
  const viewer = viewerOf(ctx)
  const subject = {
    userId: target.userId,
    name: target.name,
    roleKey: target.roleKey,
    entityIds: target.limits.length ? target.limits.map((e) => e.id) : null,
  }
  const ownerName = needsOwnerName(viewer, subject)
    ? ((await firstOwner(tx, ctx.organizationId, ctx.user.id))?.name ?? null)
    : null
  const refusal = memberRefusal(viewer, subject, action, { newRoleKey, ownerName })
  if (refusal) throw forbidden(refusal.reason, refusal.message)
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

const ENTITY_UNAVAILABLE = 'One of the entities you chose is no longer available. Choose again.'

/**
 * Entities a granter may put in a limit (member update or invitation). They must be this
 * organization's and active, and a granter limited to some entities can only grant within them:
 * they can't give "all entities", and an entity outside their limit is not found, as everywhere.
 * An archived entity of this organization is `entity_unavailable` (the sheet refetches).
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
    .select({ id: entities.id, name: entities.name, status: entities.status })
    .from(entities)
    .where(and(eq(entities.organizationId, ctx.organizationId), inArray(entities.id, unique)))
  if (rows.length !== unique.length) throw notFound()
  if (rows.some((r) => r.status !== 'active')) {
    throw conflict('entity_unavailable', ENTITY_UNAVAILABLE)
  }
  return rows.map(({ id, name }) => ({ id, name }))
}

/**
 * The security alert to every active owner (the new one included) when someone becomes an
 * owner. `byName` is who made it happen: the person who changed the role, or who invited them.
 */
export async function newOwnerAlerts(
  tx: DbOrTx,
  input: { organizationId: string; organizationName: string; byName: string; newOwnerName: string },
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
        eq(members.organizationId, input.organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
      ),
    )
  const now = new Date()
  const alert = newOwnerAlert({
    byName: input.byName,
    newOwnerName: input.newOwnerName,
    organizationName: input.organizationName,
    at: formatTime(now),
    on: formatDate(now),
    teamUrl: webUrl('/settings/team'),
  })
  return owners.map((o) => ({ to: o.email, tag: 'security_alert' as const, ...alert }))
}

export async function updateMemberAccess(
  ctx: ServiceContext,
  input: z.output<typeof updateMemberAccessInput>,
): Promise<{ notice: string; row: TeamMemberRow; emails: EmailMessage[] }> {
  const result = await ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const target = await lockTarget(tx, ctx, input.memberId)
    const [role] = await tx
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(and(eq(roles.organizationId, ctx.organizationId), eq(roles.id, input.roleId)))
    if (!role) throw notFound()
    await assertMayManage(tx, ctx, target, 'change', role.key)
    if (isOwnerKey(target.roleKey) && !isOwnerKey(role.key)) {
      if ((await otherActiveOwners(tx, ctx, target.id)) < 1) {
        throw conflict('last_owner', lastOwnerMessage(ctx))
      }
    }
    const newLimits = await assertGrantableEntities(tx, ctx, input.entityIds)

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
        entities: target.limits.length ? target.limits.map((e) => e.name) : 'all',
      },
      after: {
        role: role.name,
        entities: newLimits.length ? newLimits.map((e) => e.name).sort() : 'all',
      },
    })
    const emails =
      isOwnerKey(role.key) && !isOwnerKey(target.roleKey)
        ? await newOwnerAlerts(tx, {
            organizationId: ctx.organizationId,
            organizationName: ctx.organizationName,
            byName: ctx.user.name,
            newOwnerName: target.name,
          })
        : []
    const notice =
      role.id === target.roleId
        ? `Access updated for ${target.name}`
        : `${target.name} is now ${role.name}`
    return { notice, memberId: target.id, emails }
  })
  const row = await memberRowById(ctx, result.memberId)
  if (!row) throw notFound()
  return { notice: result.notice, row, emails: result.emails }
}

export async function removeMember(
  ctx: ServiceContext,
  memberId: string,
): Promise<{ notice: string }> {
  return ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const target = await lockTarget(tx, ctx, memberId)
    await assertMayManage(tx, ctx, target, 'remove')
    if (isOwnerKey(target.roleKey) && (await otherActiveOwners(tx, ctx, target.id)) < 1) {
      throw conflict('last_owner', lastOwnerMessage(ctx))
    }
    await tx
      .update(members)
      .set({ status: 'removed', removedAt: new Date(), removedByUserId: ctx.user.id })
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
    await assertMayManage(tx, ctx, target, 'reset')
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
