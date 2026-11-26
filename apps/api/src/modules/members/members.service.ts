import type { PermissionSet, TeamMemberRow, updateMemberAccessInput } from '@vento/shared'
import { and, asc, count, eq, isNull, ne, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, lockViewer, type ServiceContext } from '@/access/context'
import { assertGrantableEntities } from '@/access/grants'
import { type MemberAction, memberRefusal, needsOwnerName, viewerOf } from '@/access/manage-rules'
import { newOwnerAlerts } from '@/access/new-owner-alerts'
import { firstOwner } from '@/access/who-can-grant'
import type { DbOrTx } from '@/db/client'
import {
  entities,
  memberEntityLimits,
  members,
  passkeys,
  roles,
  sessions,
  twoFactors,
  users,
} from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { twoStepResetAlert } from '@/email/templates/security-alert'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { recordAccountEvent, recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'
import { loadRoles, lockAssignableRoles, onArchivedRole } from '@/modules/roles/roles.service'
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
  /** What their role can do, for the permission ceiling. */
  permissions: PermissionSet
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
  const [role] = await loadRoles(tx, ctx.organizationId, [row.roleId], { includeArchived: true })
  if (!role) throw notFound()
  return { ...row, permissions: role.permissions, limits: await currentLimits(tx, ctx, row.id) }
}

/**
 * Throws the manage rules' refusal (own access, owner only, wider permissions, wider access), if
 * any. The owner's name for "Ask … (owner)" is looked up only when a refusal line needs it.
 */
async function assertMayManage(
  tx: DbOrTx,
  ctx: ServiceContext,
  target: Target,
  action: MemberAction,
  newRole?: { key: string | null; permissions: PermissionSet },
): Promise<void> {
  const viewer = viewerOf(ctx)
  const subject = {
    userId: target.userId,
    name: target.name,
    roleKey: target.roleKey,
    permissions: target.permissions,
    entityIds: target.limits.length ? target.limits.map((e) => e.id) : null,
  }
  const ownerName = needsOwnerName(viewer, subject)
    ? ((await firstOwner(tx, ctx.organizationId, ctx.user.id))?.name ?? null)
    : null
  const refusal = memberRefusal(viewer, subject, action, {
    newRoleKey: newRole?.key,
    newRolePermissions: newRole?.permissions,
    ownerName,
  })
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

export async function updateMemberAccess(
  ctx: ServiceContext,
  input: z.output<typeof updateMemberAccessInput>,
): Promise<{ notice: string; row: TeamMemberRow; emails: EmailMessage[] }> {
  const result = await ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    // The viewer as they are now: a change to their own access waits for this write.
    const live = await lockViewer(tx, ctx)
    const target = await lockTarget(tx, live, input.memberId)
    // Locked for share: a delete of this role waits, or wins and this is role_unavailable.
    const [role] = await lockAssignableRoles(tx, live.organizationId, [input.roleId])
    if (!role) throw notFound()
    await assertMayManage(tx, live, target, 'change', role)
    if (isOwnerKey(target.roleKey) && !isOwnerKey(role.key)) {
      if ((await otherActiveOwners(tx, live, target.id)) < 1) {
        throw conflict('last_owner', lastOwnerMessage(live))
      }
    }
    const newLimits = await assertGrantableEntities(tx, live, input.entityIds)

    await onArchivedRole(
      tx.update(members).set({ roleId: role.id }).where(eq(members.id, target.id)),
    )
    await tx.delete(memberEntityLimits).where(eq(memberEntityLimits.memberId, target.id))
    if (newLimits.length) {
      await tx.insert(memberEntityLimits).values(
        newLimits.map((e) => ({
          organizationId: live.organizationId,
          memberId: target.id,
          entityId: e.id,
        })),
      )
    }
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'member.access_changed',
      actor: actorOf(live),
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
            organizationId: live.organizationId,
            organizationName: live.organizationName,
            byName: live.user.name,
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
    // The viewer as they are now: a change to their own access waits for this write.
    const live = await lockViewer(tx, ctx)
    const target = await lockTarget(tx, live, memberId)
    await assertMayManage(tx, live, target, 'remove')
    if (isOwnerKey(target.roleKey) && (await otherActiveOwners(tx, live, target.id)) < 1) {
      throw conflict('last_owner', lastOwnerMessage(live))
    }
    await tx
      .update(members)
      .set({ status: 'removed', removedAt: new Date(), removedByUserId: live.user.id })
      .where(eq(members.id, target.id))
    // Their sessions in this organization end at once; sessions in their other organizations stay.
    const ended = await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, target.userId),
          or(
            eq(sessions.activeOrganizationId, live.organizationId),
            isNull(sessions.activeOrganizationId),
          ),
        ),
      )
      .returning({ id: sessions.id })
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'member.removed',
      actor: actorOf(live),
      target: { type: 'member', id: target.id, label: target.name },
      before: { status: 'active', role: target.roleName },
      after: { status: 'removed' },
    })
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'session.revoked_by_removal',
      actor: actorOf(live),
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
    // Serialises with other access changes, so two people resetting each other can't deadlock.
    await lockOrganization(tx, ctx.organizationId)
    // The viewer as they are now: a change to their own access waits for this write.
    const live = await lockViewer(tx, ctx)
    const target = await lockTarget(tx, live, memberId)
    await assertMayManage(tx, live, target, 'reset')
    // The same per-person lock the passkeys insert trigger takes (migration 0010): a registration
    // in flight either lands first and is deleted below, or waits and is refused as reset-pending.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${target.userId}::text, 0))`)
    await tx.delete(twoFactors).where(eq(twoFactors.userId, target.userId))
    // A lost phone's passkey must stop working too (spec 3d). Before the sessions go, in the
    // same transaction: registration needs a session, so none can be added meanwhile.
    const removedPasskeys = await tx
      .delete(passkeys)
      .where(eq(passkeys.userId, target.userId))
      .returning({ id: passkeys.id })
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
      actor: actorOf(live),
      target: { type: 'user', id: target.userId, label: target.name },
      metadata: {
        resetFrom: live.organizationName,
        sessionsEnded: ended.length,
        passkeysRemoved: removedPasskeys.length,
      },
    })
    const alert = twoStepResetAlert({ byName: live.user.name })
    return {
      notice: `Two-step reset for ${target.name}. We've emailed them a link to set a new password.`,
      emails: [{ to: target.email, tag: 'security_alert', ...alert }],
      resetPasswordFor: target.email,
    }
  })
}
