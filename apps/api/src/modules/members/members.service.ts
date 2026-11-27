import type {
  PermissionSet,
  RequestOutcome,
  TeamMemberRow,
  updateMemberAccessInput,
} from '@vento/shared'
import { and, asc, count, eq, isNull, ne, or } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, lockViewer, type ServiceContext } from '@/access/context'
import { assertGrantableEntities } from '@/access/grants'
import { type MemberAction, memberRefusal, needsOwnerName, viewerOf } from '@/access/manage-rules'
import { newOwnerAlerts } from '@/access/new-owner-alerts'
import { firstOwner } from '@/access/who-can-grant'
import { cancelForLeaver, requestOrRun } from '@/approvals/engine'
import {
  approvalMetadata,
  type ExecuteMeta,
  type ExecuteResult,
  RAN_AT_ONCE,
} from '@/approvals/plugin'
import { clearSecondFactors } from '@/auth/clear-second-factors'
import type { DbOrTx } from '@/db/client'
import { entities, memberEntityLimits, members, roles, sessions, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { twoStepResetAlert } from '@/email/templates/security-alert'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { recordAccountEvent, recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'
import { loadRoles, lockAssignableRoles, onArchivedRole } from '@/modules/roles/roles.service'
import { memberRowById } from '@/modules/team/team.service'
import { activeSuperAdmin } from '@/platform/super-admins'
import { makeOwnerPlugin, type memberAccessPayload } from './approvals'

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

export type MemberAccessPayload = z.output<typeof memberAccessPayload>

type AccessSave = {
  notice: string
  row: TeamMemberRow
  outcome: RequestOutcome
  emails: EmailMessage[]
}

/**
 * Changes someone's role and companies. Making someone an owner goes through the approvals
 * engine (decision 0024) and may wait for approval; everything else runs at once.
 */
export async function updateMemberAccess(
  ctx: ServiceContext,
  input: z.output<typeof updateMemberAccessInput>,
): Promise<AccessSave> {
  const payload: MemberAccessPayload = {
    memberId: input.memberId,
    roleId: input.roleId,
    entityIds: input.entityIds,
  }
  const result = await ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    // The viewer as they are now: a change to their own access waits for this write.
    const live = await lockViewer(tx, ctx)
    const target = await lockTarget(tx, live, input.memberId)
    const [role] = await lockAssignableRoles(tx, live.organizationId, [input.roleId])
    if (!role) throw notFound()
    if (!(isOwnerKey(role.key) && !isOwnerKey(target.roleKey))) {
      const ran = await applyMemberAccess(tx, live, payload, RAN_AT_ONCE)
      return { ...ran, outcome: { ran: true as const, notice: ran.notice } }
    }
    // Refused requests are never saved: the same checks first, then the engine.
    await assertMayManage(tx, live, target, 'change', role)
    await assertGrantableEntities(tx, live, input.entityIds)
    const out = await requestOrRun(tx, live, makeOwnerPlugin, { payload, reason: input.reason })
    if (out.ran) {
      const { notice, emails } = out.result
      return { notice, emails, outcome: { ran: true as const, notice } }
    }
    return {
      notice: out.notice,
      emails: out.emails,
      outcome: { ran: false as const, requestId: out.requestId, notice: out.notice },
    }
  })
  const row = await memberRowById(ctx, input.memberId)
  if (!row) throw notFound()
  return { notice: result.notice, row, outcome: result.outcome, emails: result.emails }
}

/**
 * The only writer of a role-and-companies change (the make-owner plug-in's execute, and the
 * change above when no approval is involved). Checks everything as `ctx` is now.
 */
export async function applyMemberAccess(
  tx: DbOrTx,
  ctx: ServiceContext,
  input: MemberAccessPayload,
  meta: ExecuteMeta,
): Promise<ExecuteResult> {
  await lockOrganization(tx, ctx.organizationId)
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

  await onArchivedRole(tx.update(members).set({ roleId: role.id }).where(eq(members.id, target.id)))
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
    // Role names can repeat in spirit ("Owner (site)"); the console's "new owner" reads the key.
    metadata: { roleKey: role.key, ...approvalMetadata(meta) },
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
  return { notice, emails, afterCommit: null }
}

/** Who the make-owner plug-in describes: the person and their role now. */
export async function describeTarget(
  tx: DbOrTx,
  organizationId: string,
  memberId: string,
): Promise<{ userId: string; name: string; roleName: string } | null> {
  const [row] = await tx
    .select({ userId: members.userId, name: users.name, roleName: roles.name })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.id, memberId),
        eq(members.status, 'active'),
      ),
    )
  return row ?? null
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
    // Their pending approval requests end with them ("Cancelled because Grace Umeh left").
    await cancelForLeaver(tx, {
      organizationId: live.organizationId,
      memberId: target.id,
      makerName: target.name,
      actor: actorOf(live),
    })
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
    // Backstop: staff accounts can't be members (decision 0023), and a super-admin's two-step
    // guards every customer (audit M1), so only Vento Real Estate resets it.
    if (await activeSuperAdmin(tx, target.userId)) {
      throw forbidden(
        'permission',
        'Vento Real Estate staff reset two-step with Vento Real Estate.',
      )
    }
    const cleared = await clearSecondFactors(tx, target.userId, { mode: 'reset' })
    await recordAccountEvent(tx, {
      userId: target.userId,
      action: 'two_step.reset',
      actor: actorOf(live),
      target: { type: 'user', id: target.userId, label: target.name },
      metadata: {
        resetFrom: live.organizationName,
        sessionsEnded: cleared.sessionsEnded,
        passkeysRemoved: cleared.passkeysRemoved,
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
