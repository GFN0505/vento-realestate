import { ORPCError } from '@orpc/server'
import {
  AUTH_ERROR_MESSAGES,
  type acceptInvitationAsNewUserInput,
  type createInvitationsInput,
  type Invitation,
  type InvitationPreview,
  type InvitationStatus,
  type listInvitationsInput,
  MODULE_LABELS,
  type NextStep,
  type SystemRoleKey,
} from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, asc, count, desc, eq, gt, inArray, lte, ne, or } from 'drizzle-orm'
import type { z } from 'zod'
import {
  type AuthSession,
  type AuthUser,
  actorOf,
  type ServiceContext,
  setActiveOrganization,
  twoStepRequired,
} from '@/access/context'
import { webUrl } from '@/auth/hooks/deps'
import { checkPasswordPolicy } from '@/auth/password-policy'
import { INVITATION_TTL_MS } from '@/auth/policy'
import { rememberPasswordHash } from '@/auth/security-store'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  entities,
  invitationEntityLimits,
  invitations,
  memberEntityLimits,
  members,
  organizations,
  roles,
  users,
} from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { invitationEmail } from '@/email/templates/invitation'
import { conflict, forbidden, isUniqueViolation, notFound } from '@/lib/errors'
import { formatDate, lagosIsoDate } from '@/lib/format'
import { pageOffset, toPage } from '@/lib/paginate'
import { recordAudit } from '@/modules/audit/audit.service'
import { assertGrantableEntities } from '@/modules/members/members.service'
import { loadRoles } from '@/modules/roles/roles.service'
import { assertWithinLimit } from '@/platform/limits'
import { hashInvitationToken, newInvitationToken } from './invitation-token'

type InvitationRow = typeof invitations.$inferSelect

/** A pending invitation past its expiry reads as expired, before anything writes that down. */
export function effectiveStatus(
  row: Pick<InvitationRow, 'status' | 'expiresAt'>,
  now = new Date(),
): InvitationStatus {
  return row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status
}

async function limitsByInvitation(db: DbOrTx, organizationId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; name: string }[]>()
  const rows = await db
    .select({
      invitationId: invitationEntityLimits.invitationId,
      id: entities.id,
      name: entities.name,
    })
    .from(invitationEntityLimits)
    .innerJoin(entities, eq(entities.id, invitationEntityLimits.entityId))
    .where(
      and(
        eq(invitationEntityLimits.organizationId, organizationId),
        inArray(invitationEntityLimits.invitationId, ids),
      ),
    )
    .orderBy(asc(entities.name))
  const map = new Map<string, { id: string; name: string }[]>()
  for (const r of rows)
    map.set(r.invitationId, [...(map.get(r.invitationId) ?? []), { id: r.id, name: r.name }])
  return map
}

export async function listInvitations(
  ctx: ServiceContext,
  input: z.output<typeof listInvitationsInput>,
) {
  const now = new Date()
  // Status filters use the effective status: "pending" excludes expired ones, "expired" includes them.
  const statusFilter =
    input.status === 'pending'
      ? and(eq(invitations.status, 'pending'), gtNow(now))
      : input.status === 'expired'
        ? inArrayExpired(now)
        : input.status
          ? eq(invitations.status, input.status)
          : undefined
  const where = and(eq(invitations.organizationId, ctx.organizationId), statusFilter)
  const { limit, offset } = pageOffset(input)
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select({
        invitation: invitations,
        roleKey: roles.key,
        roleName: roles.name,
        invitedByName: users.name,
      })
      .from(invitations)
      .innerJoin(
        roles,
        and(eq(roles.id, invitations.roleId), eq(roles.organizationId, invitations.organizationId)),
      )
      .innerJoin(users, eq(users.id, invitations.invitedByUserId))
      .where(where)
      .orderBy(desc(invitations.createdAt))
      .limit(limit)
      .offset(offset),
    ctx.db.select({ n: count() }).from(invitations).where(where),
  ])
  const limits = await limitsByInvitation(
    ctx.db,
    ctx.organizationId,
    rows.map((r) => r.invitation.id),
  )
  const items: Invitation[] = rows.map(({ invitation: i, roleKey, roleName, invitedByName }) => ({
    id: i.id,
    email: i.email,
    role: { id: i.roleId, key: roleKey as SystemRoleKey | null, name: roleName },
    entities: limits.get(i.id) ?? null,
    status: effectiveStatus(i, now),
    invitedByName,
    expiresAt: i.expiresAt.toISOString(),
    lastSentAt: i.lastSentAt.toISOString(),
    respondedAt: i.respondedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }))
  return toPage(items, input, total?.n ?? 0)
}

function gtNow(now: Date) {
  return gt(invitations.expiresAt, now)
}
function inArrayExpired(now: Date) {
  return or(
    eq(invitations.status, 'expired'),
    and(eq(invitations.status, 'pending'), lte(invitations.expiresAt, now)),
  )
}

type InvitationDetails = {
  organizationName: string
  inviterName: string
  roleName: string
  entities: string[] | 'all'
  canApprove: string[]
  twoStepRequired: boolean
}

async function details(db: DbOrTx, row: InvitationRow): Promise<InvitationDetails> {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.invitedByUserId))
  const [role] = await loadRoles(db, row.organizationId, [row.roleId])
  const limits = (await limitsByInvitation(db, row.organizationId, [row.id])).get(row.id)
  return {
    organizationName: org?.name ?? '',
    inviterName: inviter?.name ?? '',
    roleName: role?.name ?? '',
    entities: limits ? limits.map((e) => e.name) : 'all',
    canApprove: (role?.canApprove ?? []).map((m) => MODULE_LABELS[m]),
    twoStepRequired: Boolean(role?.requiresTwoStep),
  }
}

function invitationMessage(row: InvitationRow, token: string, d: InvitationDetails): EmailMessage {
  return {
    to: row.email,
    tag: 'invitation',
    ...invitationEmail({
      ...d,
      expiresOn: formatDate(row.expiresAt),
      url: webUrl(`/accept-invitation/${token}`),
    }),
  }
}

/** Up to 20 at once, all or nothing. Emails go out after commit (the router sends them). */
export async function createInvitations(
  ctx: ServiceContext,
  input: z.output<typeof createInvitationsInput>,
): Promise<{ sent: number; notice: string; emails: EmailMessage[] }> {
  return ctx.db.transaction(async (tx) => {
    const roleIds = [...new Set(input.items.map((i) => i.roleId))]
    const roleRows = await tx
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(and(eq(roles.organizationId, ctx.organizationId), inArray(roles.id, roleIds)))
    if (roleRows.length !== roleIds.length) throw notFound()
    if (roleRows.some((r) => r.key === 'owner') && ctx.member.roleKey !== 'owner') {
      throw forbidden('owner_only', 'Only owners can invite someone as an owner.')
    }
    const limitEntities = await assertGrantableEntities(tx, ctx, input.entityIds)
    const emails = input.items.map((i) => i.email)

    const [alreadyMember] = await tx
      .select({ email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, ctx.organizationId),
          eq(members.status, 'active'),
          inArray(users.email, emails),
        ),
      )
      .limit(1)
    if (alreadyMember) {
      throw conflict(
        'already_member',
        `${alreadyMember.email} is already a member of ${ctx.organizationName}.`,
      )
    }
    const now = new Date()
    const pending = await tx
      .select({ id: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, ctx.organizationId),
          eq(invitations.status, 'pending'),
          inArray(invitations.email, emails),
        ),
      )
      .for('update')
    const live = pending.find((p) => p.expiresAt > now)
    if (live) {
      throw alreadyInvited(live.email)
    }
    // Members plus live invitations count against the plan; expired ones don't.
    await assertWithinLimit(tx, ctx, 'members', input.items.length)
    // Expired-but-pending rows would block the "one pending per email" index: mark them first.
    if (pending.length) {
      await tx
        .update(invitations)
        .set({ status: 'expired' })
        .where(
          inArray(
            invitations.id,
            pending.map((p) => p.id),
          ),
        )
    }

    const messages: EmailMessage[] = []
    for (const item of input.items) {
      const { token, tokenHash } = newInvitationToken()
      const [row] = await alreadyInvitedOnRace(
        item.email,
        tx
          .insert(invitations)
          .values({
            organizationId: ctx.organizationId,
            email: item.email,
            roleId: item.roleId,
            invitedByUserId: ctx.user.id,
            tokenHash,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
            lastSentAt: now,
          })
          .returning(),
      )
      if (!row) throw new Error('Invitation insert returned nothing')
      if (limitEntities.length) {
        await tx.insert(invitationEntityLimits).values(
          limitEntities.map((e) => ({
            organizationId: ctx.organizationId,
            invitationId: row.id,
            entityId: e.id,
          })),
        )
      }
      const d = await details(tx, row)
      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        action: 'invitation.sent',
        actor: actorOf(ctx),
        target: { type: 'invitation', id: row.id, label: row.email },
        after: {
          email: row.email,
          role: d.roleName,
          entities: d.entities,
          expiresAt: row.expiresAt.toISOString(),
        },
      })
      messages.push(invitationMessage(row, token, d))
    }
    const n = input.items.length
    return {
      sent: n,
      notice:
        n === 1 ? `Invitation sent to ${input.items[0]?.email}` : `Invitations sent to ${n} people`,
      emails: messages,
    }
  })
}

function alreadyInvited(email: string) {
  return conflict('already_invited', `${email} already has an invitation. Resend it instead.`)
}

/** Two people inviting the same email at once: the second hits the unique index, not a 500. */
async function alreadyInvitedOnRace<T>(email: string, write: Promise<T>): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isUniqueViolation(error, 'invitations_org_email_pending_unique'))
      throw alreadyInvited(email)
    throw error
  }
}

async function lockInvitationById(
  tx: DbOrTx,
  ctx: ServiceContext,
  id: string,
): Promise<InvitationRow> {
  const [row] = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.organizationId, ctx.organizationId), eq(invitations.id, id)))
    .for('update')
  if (!row) throw notFound()
  return row
}

function notPendingError(row: InvitationRow, inviterName: string) {
  const status = effectiveStatus(row)
  if (status === 'expired') {
    return conflict(
      'invitation_expired',
      `This invitation expired on ${formatDate(row.expiresAt)}. Ask ${inviterName} to send a new one.`,
    )
  }
  if (status === 'withdrawn')
    return conflict('invitation_withdrawn', 'This invitation was withdrawn.')
  return conflict('invitation_not_pending', 'This invitation has already been used.')
}

/** New link, fresh 7 days; the old link stops working. Works for expired invitations too. */
export async function resendInvitation(
  ctx: ServiceContext,
  id: string,
): Promise<{ notice: string; emails: EmailMessage[] }> {
  return ctx.db.transaction(async (tx) => {
    const current = await lockInvitationById(tx, ctx, id)
    if (current.status !== 'pending' && current.status !== 'expired') {
      throw notPendingError(current, ctx.user.name)
    }
    const now = new Date()
    // An old invitation can't come back while a newer one for the same email is live.
    const [newer] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, ctx.organizationId),
          eq(invitations.email, current.email),
          eq(invitations.status, 'pending'),
          ne(invitations.id, id),
          gt(invitations.expiresAt, now),
        ),
      )
    if (newer) throw alreadyInvited(current.email)
    // An expired invitation stopped counting; bringing it back takes a place again.
    if (effectiveStatus(current, now) === 'expired') {
      await assertWithinLimit(tx, ctx, 'members', 1)
    }
    // A newer one that has lapsed but still reads 'pending' would trip the unique index.
    await tx
      .update(invitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(invitations.organizationId, ctx.organizationId),
          eq(invitations.email, current.email),
          eq(invitations.status, 'pending'),
          ne(invitations.id, id),
        ),
      )
    const { token, tokenHash } = newInvitationToken()
    const [row] = await alreadyInvitedOnRace(
      current.email,
      tx
        .update(invitations)
        .set({
          status: 'pending',
          tokenHash,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          lastSentAt: now,
        })
        .where(eq(invitations.id, id))
        .returning(),
    )
    if (!row) throw notFound()
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'invitation.resent',
      actor: actorOf(ctx),
      target: { type: 'invitation', id, label: row.email },
      before: { expiresAt: current.expiresAt.toISOString() },
      after: { expiresAt: row.expiresAt.toISOString() },
    })
    const d = await details(tx, row)
    return {
      notice: `Invitation sent again to ${row.email}`,
      emails: [invitationMessage(row, token, d)],
    }
  })
}

export async function withdrawInvitation(
  ctx: ServiceContext,
  id: string,
): Promise<{ notice: string }> {
  return ctx.db.transaction(async (tx) => {
    const current = await lockInvitationById(tx, ctx, id)
    if (effectiveStatus(current) !== 'pending') throw notPendingError(current, ctx.user.name)
    await tx
      .update(invitations)
      .set({ status: 'withdrawn', respondedAt: new Date() })
      .where(eq(invitations.id, id))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'invitation.withdrawn',
      actor: actorOf(ctx),
      target: { type: 'invitation', id, label: current.email },
      before: { status: 'pending' },
      after: { status: 'withdrawn' },
    })
    return { notice: 'Invitation withdrawn' }
  })
}

async function findByToken(db: DbOrTx, token: string, lock = false): Promise<InvitationRow> {
  const query = db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashInvitationToken(token)))
  const [row] = lock ? await query.for('update') : await query
  if (!row) throw notFound()
  return row
}

export async function previewInvitation(db: DbOrTx, token: string): Promise<InvitationPreview> {
  const row = await findByToken(db, token)
  const d = await details(db, row)
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.email))
  return {
    ...d,
    status: effectiveStatus(row),
    email: row.email,
    expiresOn: lagosIsoDate(row.expiresAt),
    hasAccount: Boolean(account),
  }
}

async function assertAcceptable(db: DbOrTx, row: InvitationRow) {
  if (effectiveStatus(row) === 'pending') return
  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.invitedByUserId))
  throw notPendingError(row, inviter?.name ?? 'the person who invited you')
}

/** Membership plus the invitation's entity limits; marks the invitation accepted. */
async function joinOrganization(
  tx: DbOrTx,
  row: InvitationRow,
  user: { id: string; name: string },
) {
  const [existing] = await tx
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, row.organizationId),
        eq(members.userId, user.id),
        eq(members.status, 'active'),
      ),
    )
  if (existing) throw conflict('already_member', 'You are already a member of this organization.')
  // The invitation already holds a place, so adding nothing: refused only when the organization
  // is over its people limit (e.g. after a downgrade).
  await assertWithinLimit(
    tx,
    { organizationId: row.organizationId, member: { roleKey: null }, user },
    'members',
    0,
  )
  const [member] = await tx
    .insert(members)
    .values({ organizationId: row.organizationId, userId: user.id, roleId: row.roleId })
    .returning({ id: members.id })
  if (!member) throw new Error('Member insert returned nothing')
  const limits = await tx
    .select({ entityId: invitationEntityLimits.entityId })
    .from(invitationEntityLimits)
    .where(eq(invitationEntityLimits.invitationId, row.id))
  if (limits.length) {
    await tx.insert(memberEntityLimits).values(
      limits.map((l) => ({
        organizationId: row.organizationId,
        memberId: member.id,
        entityId: l.entityId,
      })),
    )
  }
  await tx
    .update(invitations)
    .set({ status: 'accepted', respondedAt: new Date(), acceptedUserId: user.id })
    .where(eq(invitations.id, row.id))
  await recordAudit(tx, {
    organizationId: row.organizationId,
    action: 'invitation.accepted',
    actor: { userId: user.id, name: user.name },
    target: { type: 'invitation', id: row.id, label: row.email },
    before: { status: 'pending' },
    after: { status: 'accepted' },
  })
}

/** Where the person goes after joining: two-step setup when the role needs it. */
async function nextStepAfterJoin(
  db: DbOrTx,
  row: InvitationRow,
  userId: string,
): Promise<NextStep> {
  const [role] = await db
    .select({ requiresTwoStep: roles.requiresTwoStep })
    .from(roles)
    .where(eq(roles.id, row.roleId))
  const [user] = await db
    .select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoStepSetupRequired: users.twoStepSetupRequired,
    })
    .from(users)
    .where(eq(users.id, userId))
  if (!user) return 'ready'
  return twoStepRequired(user, role ?? null) && !user.twoFactorEnabled ? 'two_step_setup' : 'ready'
}

/** Signed in as the invited email (an existing Vento user joining another organization). */
export async function acceptInvitation(
  db: DbOrTx,
  actor: { user: Pick<AuthUser, 'id' | 'name' | 'email'>; session: Pick<AuthSession, 'id'> },
  token: string,
): Promise<{ nextStep: NextStep }> {
  return db.transaction(async (tx) => {
    const row = await findByToken(tx, token, true)
    if (row.email !== actor.user.email.toLowerCase()) {
      throw forbidden('invitation_email_mismatch', `This invitation is for ${row.email}`)
    }
    await assertAcceptable(tx, row)
    await joinOrganization(tx, row, actor.user)
    await setActiveOrganization(tx, {
      userId: actor.user.id,
      sessionId: actor.session.id,
      organizationId: row.organizationId,
    })
    return { nextStep: await nextStepAfterJoin(tx, row, actor.user.id) }
  })
}

/**
 * New person: creates the account (email verified, since the token proves the inbox) and the
 * membership in one transaction. The router then signs them in through Better Auth.
 */
export async function acceptInvitationAsNewUser(
  db: DbOrTx,
  input: z.output<typeof acceptInvitationAsNewUserInput>,
): Promise<{ email: string; nextStep: NextStep }> {
  const failure = checkPasswordPolicy(input.password)
  if (failure) {
    throw new ORPCError('BAD_REQUEST', {
      message: AUTH_ERROR_MESSAGES[failure],
      data: { reason: failure },
    })
  }
  const passwordHash = await hashPassword(input.password)
  return db.transaction(async (tx) => {
    const row = await findByToken(tx, input.token, true)
    await assertAcceptable(tx, row)
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, row.email))
    if (existing)
      throw conflict('account_exists', 'You already have a Vento account. Sign in to accept.')
    const [user] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: row.email,
        emailVerified: true,
        lastActiveOrganizationId: row.organizationId,
        termsVersion: input.termsVersion,
        termsAcceptedAt: new Date(),
      })
      .returning({ id: users.id, name: users.name })
    if (!user) throw new Error('User insert returned nothing')
    await tx.insert(accounts).values({
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: passwordHash,
    })
    await rememberPasswordHash(tx, user.id, passwordHash)
    await joinOrganization(tx, row, user)
    return { email: row.email, nextStep: await nextStepAfterJoin(tx, row, user.id) }
  })
}

export async function declineInvitation(db: DbOrTx, token: string): Promise<{ notice: string }> {
  return db.transaction(async (tx) => {
    const row = await findByToken(tx, token, true)
    await assertAcceptable(tx, row)
    await tx
      .update(invitations)
      .set({ status: 'declined', respondedAt: new Date() })
      .where(eq(invitations.id, row.id))
    await recordAudit(tx, {
      organizationId: row.organizationId,
      action: 'invitation.declined',
      actor: { userId: null, name: row.email },
      target: { type: 'invitation', id: row.id, label: row.email },
      before: { status: 'pending' },
      after: { status: 'declined' },
    })
    return { notice: 'Invitation declined' }
  })
}
