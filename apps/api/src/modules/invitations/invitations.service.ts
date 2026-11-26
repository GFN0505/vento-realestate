import { ORPCError } from '@orpc/server'
import {
  AUTH_ERROR_MESSAGES,
  type acceptInvitationAsNewUserInput,
  type createInvitationsInput,
  type InvitationPreview,
  type InvitationStatus,
  MODULE_LABELS,
  type NextStep,
  type TeamInvitationRow,
} from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, asc, eq, gt, inArray, lte, ne } from 'drizzle-orm'
import type { z } from 'zod'
import {
  type AuthSession,
  type AuthUser,
  actorOf,
  lockViewer,
  type ServiceContext,
  setActiveOrganization,
} from '@/access/context'
import { assertGrantableEntities } from '@/access/grants'
import {
  GRANT_CEILING_MESSAGE,
  invitationRefusal,
  needsOwnerName,
  viewerOf,
  widerThan,
} from '@/access/manage-rules'
import { newOwnerAlerts } from '@/access/new-owner-alerts'
import { memberTwoStepGate } from '@/access/two-step-gate'
import { firstOwner } from '@/access/who-can-grant'
import { webUrl } from '@/auth/hooks/deps'
import { checkPasswordPolicy } from '@/auth/password-policy'
import { INVITATION_RESEND_INTERVAL_MS, INVITATION_TTL_MS } from '@/auth/policy'
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
import { conflict, forbidden, isUniqueViolation, notFound, tooManyRequests } from '@/lib/errors'
import { formatDate, lagosIsoDate } from '@/lib/format'
import { recordAudit } from '@/modules/audit/audit.service'
import { loadRoles, lockAssignableRoles, onArchivedRole } from '@/modules/roles/roles.service'
import { invitationRowsById } from '@/modules/team/team.service'
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
    .select({
      name: organizations.name,
      twoStepForEveryone: organizations.twoStepRequiredForEveryone,
    })
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
    twoStepRequired: Boolean(role?.requiresTwoStep || org?.twoStepForEveryone),
  }
}

/** Safe inside a quoted display name: no quotes, backslashes, line breaks or control characters. */
export function displayName(value: string): string {
  const safe = [...value.replace(/\s+/g, ' ')]
    .filter((c) => c !== '"' && c !== '\\' && c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f)
    .join('')
  return safe.trim().slice(0, 60)
}

/**
 * "Vento Homes Ltd via Vento", replies to the person who sent it (a colleague, not a no-reply
 * box), and the invitation's id for the bounce webhook (ids only, never personal data).
 */
function invitationMessage(
  row: InvitationRow,
  token: string,
  d: InvitationDetails,
  sender: { name: string; email: string },
): EmailMessage {
  return {
    to: row.email,
    tag: 'invitation',
    fromName: displayName(`${d.organizationName} via Vento`),
    replyTo: { name: displayName(sender.name), email: sender.email },
    metadata: { invitationId: row.id },
    ...invitationEmail({
      ...d,
      expiresOn: formatDate(row.expiresAt),
      url: webUrl(`/accept-invitation/${token}`),
    }),
  }
}

/**
 * Everyone in the batch who is already a member, or already has a live invitation, in one
 * refusal: the sheet marks every such row at once. Nothing is sent.
 */
function clashError(
  ctx: ServiceContext,
  alreadyMembers: string[],
  alreadyInvited: { email: string; id: string }[],
) {
  const n = alreadyMembers.length + alreadyInvited.length
  const reason = alreadyMembers.length ? 'already_member' : 'already_invited'
  const [member] = alreadyMembers
  const [invited] = alreadyInvited
  const message =
    n > 1
      ? `${n} of these people are already in or invited. Nothing was sent.`
      : member
        ? `${member} is already a member of ${ctx.organizationName}.`
        : `${invited?.email} already has an invitation. Resend it instead.`
  return conflict(reason, message, { alreadyMembers, alreadyInvited })
}

/** Up to 20 at once, all or nothing. Emails go out after commit (the router sends them). */
export async function createInvitations(
  ctx: ServiceContext,
  input: z.output<typeof createInvitationsInput>,
): Promise<{
  sent: number
  notice: string
  invitations: TeamInvitationRow[]
  emails: EmailMessage[]
  sentAt: Date
}> {
  const now = new Date()
  const created = await ctx.db.transaction(async (tx) => {
    // Lock order (docs/ARCHITECTURE.md): the inviter as they are now, then the open invitations
    // for these emails, then the roles being given.
    const inviter = await lockViewer(tx, ctx)
    const emails = input.items.map((i) => i.email)
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
    // Locked for share: a delete of one of these roles waits, or wins and this is role_unavailable.
    const roleRows = await lockAssignableRoles(
      tx,
      ctx.organizationId,
      input.items.map((i) => i.roleId),
    )
    if (roleRows.some((r) => r.key === 'owner') && inviter.member.roleKey !== 'owner') {
      throw forbidden('owner_only', 'Only owners can invite someone as an owner.')
    }
    if (roleRows.some((r) => widerThan(viewerOf(inviter), r.permissions))) {
      throw forbidden('wider_permissions', GRANT_CEILING_MESSAGE)
    }
    const limitEntities = await assertGrantableEntities(tx, inviter, input.entityIds)

    const alreadyMembers = await tx
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
    const memberEmails = new Set(alreadyMembers.map((m) => m.email))
    const live = pending.filter((p) => p.expiresAt > now && !memberEmails.has(p.email))
    if (memberEmails.size || live.length) {
      throw clashError(
        ctx,
        emails.filter((e) => memberEmails.has(e)),
        live.map(({ email, id }) => ({ email, id })),
      )
    }
    // Members plus live invitations count against the plan; expired ones don't.
    await assertWithinLimit(tx, inviter, 'members', input.items.length)
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
    const ids: string[] = []
    for (const item of input.items) {
      const { token, tokenHash } = newInvitationToken()
      const [row] = await alreadyInvitedOnRace(
        item.email,
        onArchivedRole(
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
              delivery: 'queued',
              deliveryChangedAt: now,
            })
            .returning(),
        ),
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
      messages.push(invitationMessage(row, token, d, ctx.user))
      ids.push(row.id)
    }
    return { messages, ids }
  })
  const n = input.items.length
  return {
    sent: n,
    notice:
      n === 1 ? `Invitation sent to ${input.items[0]?.email}` : `Invitations sent to ${n} people`,
    invitations: await invitationRowsById(ctx, created.ids),
    emails: created.messages,
    sentAt: now,
  }
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

/** The invitation's entity limit (null = all), role key and permissions, for the manage rules. */
async function invitationScope(tx: DbOrTx, row: InvitationRow) {
  const [role] = await loadRoles(tx, row.organizationId, [row.roleId], { includeArchived: true })
  if (!role) throw notFound()
  const limits = await tx
    .select({ entityId: invitationEntityLimits.entityId })
    .from(invitationEntityLimits)
    .where(
      and(
        eq(invitationEntityLimits.organizationId, row.organizationId),
        eq(invitationEntityLimits.invitationId, row.id),
      ),
    )
  return {
    email: row.email,
    roleKey: role.key,
    permissions: role.permissions,
    entityIds: limits.length ? limits.map((l) => l.entityId) : null,
  }
}

/** Throws the manage rules' refusal for resending or withdrawing this invitation, if any. */
async function assertMayManageInvitation(
  tx: DbOrTx,
  ctx: ServiceContext,
  row: InvitationRow,
  action: 'resend' | 'withdraw',
): Promise<void> {
  const viewer = viewerOf(ctx)
  const target = await invitationScope(tx, row)
  const ownerName = needsOwnerName(viewer, target)
    ? ((await firstOwner(tx, ctx.organizationId, ctx.user.id))?.name ?? null)
    : null
  const refusal = invitationRefusal(viewer, target, action, { ownerName })
  if (refusal) throw forbidden(refusal.reason, refusal.message)
}

const RESEND_TOO_SOON = 'We sent it less than a minute ago. Try again shortly.'

/**
 * New link, fresh 7 days; the old link stops working. Works for expired invitations too. Once a
 * minute per invitation: checked on the locked row and again in the update itself, so it holds
 * across API instances.
 */
export async function resendInvitation(
  ctx: ServiceContext,
  id: string,
): Promise<{ notice: string; emails: EmailMessage[]; sentAt: Date }> {
  const now = new Date()
  return ctx.db.transaction(async (tx) => {
    const viewer = await lockViewer(tx, ctx)
    const current = await lockInvitationById(tx, ctx, id)
    // Accepted, declined or withdrawn since the list loaded: it's gone from Team, so "not found"
    // (the web says the list is up to date). The invitee-facing copy would name the caller.
    if (current.status !== 'pending' && current.status !== 'expired') throw notFound()
    // Resending re-issues the grant: lock its role first (a delete waits, or won and this is
    // role_unavailable), then check the ceiling against the role as it now is.
    await lockAssignableRoles(tx, ctx.organizationId, [current.roleId])
    await assertMayManageInvitation(tx, viewer, current, 'resend')
    const cutoff = new Date(now.getTime() - INVITATION_RESEND_INTERVAL_MS)
    if (current.lastSentAt > cutoff) {
      throw tooManyRequests(
        RESEND_TOO_SOON,
        (current.lastSentAt.getTime() - cutoff.getTime()) / 1000,
      )
    }
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
    // They joined meanwhile (through a newer invitation, say): nothing to resend.
    const [joined] = await tx
      .select({ id: members.id })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, ctx.organizationId),
          eq(members.status, 'active'),
          eq(users.email, current.email),
        ),
      )
    if (joined) throw clashError(ctx, [current.email], [])
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
      onArchivedRole(
        tx
          .update(invitations)
          .set({
            status: 'pending',
            tokenHash,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
            lastSentAt: now,
            delivery: 'queued',
            deliveryChangedAt: now,
            deliveryMessageId: null,
          })
          .where(
            and(
              eq(invitations.organizationId, ctx.organizationId),
              eq(invitations.id, id),
              lte(invitations.lastSentAt, cutoff),
            ),
          )
          .returning(),
      ),
    )
    if (!row) throw tooManyRequests(RESEND_TOO_SOON, INVITATION_RESEND_INTERVAL_MS / 1000)
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
      emails: [invitationMessage(row, token, d, ctx.user)],
      sentAt: now,
    }
  })
}

/**
 * Takes back an open invitation, expired ones included: otherwise an expired invitation would
 * sit on the Team list with no way to clear it except resending.
 */
export async function withdrawInvitation(
  ctx: ServiceContext,
  id: string,
): Promise<{ notice: string }> {
  return ctx.db.transaction(async (tx) => {
    const viewer = await lockViewer(tx, ctx)
    const current = await lockInvitationById(tx, ctx, id)
    // Answered or withdrawn since the list loaded: gone from Team, so "not found".
    if (current.status !== 'pending') throw notFound()
    await assertMayManageInvitation(tx, viewer, current, 'withdraw')
    await tx
      .update(invitations)
      .set({ status: 'withdrawn', respondedAt: new Date() })
      .where(eq(invitations.id, id))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'invitation.withdrawn',
      actor: actorOf(ctx),
      target: { type: 'invitation', id, label: current.email },
      before: { status: effectiveStatus(current) },
      after: { status: 'withdrawn' },
    })
    return { notice: `Invitation to ${current.email} withdrawn` }
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

/**
 * Membership plus the invitation's entity limits; marks the invitation accepted. Joining as an
 * owner returns the "is now an owner" alert for every owner (sent after commit).
 */
async function joinOrganization(
  tx: DbOrTx,
  row: InvitationRow,
  user: { id: string; name: string },
): Promise<EmailMessage[]> {
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
  const [role] = await tx
    .select({ key: roles.key })
    .from(roles)
    .where(and(eq(roles.organizationId, row.organizationId), eq(roles.id, row.roleId)))
  if (role?.key !== 'owner') return []
  const d = await details(tx, row)
  return newOwnerAlerts(tx, {
    organizationId: row.organizationId,
    organizationName: d.organizationName,
    byName: d.inviterName,
    newOwnerName: user.name,
  })
}

/**
 * Where the person goes after joining: two-step setup when the role or the organization needs
 * it. Joining is entering the organization, so its setting applies at once (no grace).
 */
async function nextStepAfterJoin(
  db: DbOrTx,
  row: InvitationRow,
  userId: string,
): Promise<NextStep> {
  const [role] = await db
    .select({ requiresTwoStep: roles.requiresTwoStep })
    .from(roles)
    .where(and(eq(roles.organizationId, row.organizationId), eq(roles.id, row.roleId)))
  const [org] = await db
    .select({
      required: organizations.twoStepRequiredForEveryone,
      since: organizations.twoStepRequiredChangedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
  const [user] = await db
    .select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoStepSetupRequired: users.twoStepSetupRequired,
    })
    .from(users)
    .where(eq(users.id, userId))
  if (!user) return 'ready'
  const gate = memberTwoStepGate(
    user,
    {
      requiresTwoStep: Boolean(role?.requiresTwoStep),
      organizationTwoStep: { required: Boolean(org?.required), since: org?.since ?? null },
    },
    null,
    new Date(),
  )
  return gate.kind === 'required' ? 'two_step_setup' : 'ready'
}

/** Signed in as the invited email (an existing Vento user joining another organization). */
export async function acceptInvitation(
  db: DbOrTx,
  actor: { user: Pick<AuthUser, 'id' | 'name' | 'email'>; session: Pick<AuthSession, 'id'> },
  token: string,
): Promise<{ nextStep: NextStep; emails: EmailMessage[] }> {
  return db.transaction(async (tx) => {
    const row = await findByToken(tx, token, true)
    if (row.email !== actor.user.email.toLowerCase()) {
      throw forbidden('invitation_email_mismatch', `This invitation is for ${row.email}`)
    }
    await assertAcceptable(tx, row)
    const emails = await joinOrganization(tx, row, actor.user)
    await setActiveOrganization(tx, {
      userId: actor.user.id,
      sessionId: actor.session.id,
      organizationId: row.organizationId,
    })
    return { nextStep: await nextStepAfterJoin(tx, row, actor.user.id), emails }
  })
}

/**
 * New person: creates the account (email verified, since the token proves the inbox) and the
 * membership in one transaction. The router then signs them in through Better Auth.
 */
export async function acceptInvitationAsNewUser(
  db: DbOrTx,
  input: z.output<typeof acceptInvitationAsNewUserInput>,
): Promise<{ email: string; nextStep: NextStep; emails: EmailMessage[] }> {
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
    const emails = await joinOrganization(tx, row, user)
    return { email: row.email, nextStep: await nextStepAfterJoin(tx, row, user.id), emails }
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
