import type { PreviewLine } from '@vento/shared/console'
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import { webUrl } from '@/auth/hooks/deps'
import {
  STAFF_INVITATION_RESEND_MS,
  STAFF_INVITATION_TTL_MS,
  STAFF_INVITATIONS_OPEN_MAX,
} from '@/auth/policy'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, staffInvitations, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { staffInvitationEmail, superAdminsChangedEmail } from '@/email/templates/platform-notices'
import { formatDate, formatTime } from '@/lib/format'
import { newInvitationToken } from '@/modules/invitations/invitation-token'
import { type PlatformActor, recordPlatformAudit } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { SETUP_ACTOR } from '../seed-plans'
import {
  discardStaffAccountOf,
  discardUnfinishedStaffAccounts,
  openInvitation,
} from '../staff-accounts'
import { activeSuperAdminCount, otherSuperAdmins } from '../super-admins'
import type { Preview } from './release'

// Staff invitations (admin-console plan §1b.5): the console and the command line run these.
// Each write takes the platform_admins lock, discards unfinished staff accounts first, and writes
// exactly one platform audit row (so a console retry with the same key is a replay). Emails are
// returned and sent by the caller after commit.

/** The owner asked for a second approver from four super-admins on (not built yet). */
const SECOND_APPROVER_AT = 4

export type StaffInvitationActor = PlatformActor | 'bootstrap'

export type StaffInvitationResult = {
  done: string
  emails: EmailMessage[]
  /** The bootstrap invitation's link, printed once by the command. */
  link?: string
}

/** "29 Nov 2026, 14:30" in Lagos. */
export const untilText = (at: Date): string => `${formatDate(at)}, ${formatTime(at)}`
const atText = (at: Date): string => `${formatTime(at)} on ${formatDate(at)}`

export const staffInvitationLink = (token: string): string => webUrl(`/staff-invitation/${token}`)

async function lockPlatformAdmins(tx: DbOrTx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
}

async function openInvitationCount(db: DbOrTx, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staffInvitations)
    .where(openInvitation(now))
  return row?.n ?? 0
}

type Invitee = { email: string; name: string }

/** The refusals shared by the preview and the invite, in the spec's order. */
async function assertInvitable(
  db: DbOrTx,
  invitee: Invitee,
  options: { bootstrap: boolean; now: Date },
): Promise<void> {
  const [account] = await db
    .select({ id: users.id, name: users.name, accountKind: users.accountKind })
    .from(users)
    .where(eq(users.email, invitee.email))
  if (account?.accountKind === 'customer') {
    throw new PlatformError(
      `${invitee.email} already has a Vento Real Estate customer account. Invite a different email, such as their @ventoerp.com address.`,
    )
  }
  if (account) {
    const [active] = await db
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, account.id), isNull(platformAdmins.revokedAt)))
    if (active) throw new PlatformError(`${account.name} is already a super-admin.`)
  }
  const [open] = await db
    .select({ id: staffInvitations.id, expiresAt: staffInvitations.expiresAt })
    .from(staffInvitations)
    .where(and(eq(staffInvitations.email, invitee.email), openInvitation(options.now)))
  if (open) {
    throw new PlatformError(
      `${invitee.email} already has an invitation that expires ${untilText(open.expiresAt)}.`,
      'refused',
      { next: 'resend_invitation', invitationId: open.id },
    )
  }
  if (
    !options.bootstrap &&
    (await openInvitationCount(db, options.now)) >= STAFF_INVITATIONS_OPEN_MAX
  ) {
    throw new PlatformError(
      `There are ${STAFF_INVITATIONS_OPEN_MAX} open invitations. Withdraw one or wait for it to be accepted.`,
    )
  }
}

export async function previewInvite(
  db: DbOrTx,
  invitee: Invitee,
  now = new Date(),
): Promise<Preview<Record<string, never>>> {
  await assertInvitable(db, invitee, { bootstrap: false, now })
  const lines: PreviewLine[] = [
    {
      text: `${invitee.name} (${invitee.email}) gets an email to join. The link works for 48 hours.`,
      tone: 'info',
    },
    {
      text: 'They become a super-admin only after setting a password and two-step sign-in.',
      tone: 'info',
    },
  ]
  const counted = (await activeSuperAdminCount(db)) + (await openInvitationCount(db, now))
  if (counted + 1 >= SECOND_APPROVER_AT) {
    lines.push({
      text: "This would be the fourth super-admin. The owner asked for a second approver from then on; that's not built yet.",
      tone: 'warning',
    })
  }
  return { lines, expected: {} }
}

/**
 * Invites someone to become a super-admin. `bootstrap` (the command line on an empty environment)
 * works only while there is no active super-admin, replaces the open bootstrap invitation, and
 * returns the link to print.
 */
export async function inviteSuperAdmin(
  db: DbOrTx,
  actor: StaffInvitationActor,
  input: Invitee & { reason: string; operator: string | null },
  now = new Date(),
): Promise<StaffInvitationResult> {
  const bootstrap = actor === 'bootstrap'
  return db.transaction(async (tx) => {
    await lockPlatformAdmins(tx)
    if (bootstrap && (await activeSuperAdminCount(tx)) > 0) {
      throw new PlatformError(
        "There's already a super-admin. Ask them to invite you from the console.",
      )
    }
    if (bootstrap) {
      // A re-run replaces the open bootstrap invitation, whoever it was for.
      const old = await tx
        .select({ id: staffInvitations.id })
        .from(staffInvitations)
        .where(and(eq(staffInvitations.bootstrap, true), eq(staffInvitations.status, 'pending')))
      for (const row of old) await discardStaffAccountOf(tx, row.id)
      await tx
        .update(staffInvitations)
        .set({ status: 'withdrawn', respondedAt: now })
        .where(and(eq(staffInvitations.bootstrap, true), eq(staffInvitations.status, 'pending')))
    }
    await discardUnfinishedStaffAccounts(tx, now)
    await assertInvitable(tx, input, { bootstrap, now })
    // A stale pending row would block the "one pending per email" index: store its expiry.
    await tx
      .update(staffInvitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(staffInvitations.email, input.email),
          eq(staffInvitations.status, 'pending'),
          lte(staffInvitations.expiresAt, now),
        ),
      )
    const by: PlatformActor = bootstrap ? { ...SETUP_ACTOR, operator: input.operator } : actor
    const { token, tokenHash } = newInvitationToken()
    const expiresAt = new Date(now.getTime() + STAFF_INVITATION_TTL_MS)
    const [row] = await tx
      .insert(staffInvitations)
      .values({
        email: input.email,
        name: input.name,
        reason: input.reason,
        invitedByUserId: by.userId,
        bootstrap,
        tokenHash,
        expiresAt,
        lastSentAt: now,
      })
      .returning({ id: staffInvitations.id })
    if (!row) throw new Error('Staff invitation insert returned nothing')
    const done = `Invitation sent to ${input.name}`
    await recordPlatformAudit(tx, {
      actor: by,
      action: 'superadmin.invited',
      targetType: 'staff_invitation',
      targetKey: row.id,
      after: { name: input.name, email: input.email, expiresAt: expiresAt.toISOString() },
      reason: input.reason,
      metadata: { bootstrap },
      done,
    })
    const link = staffInvitationLink(token)
    const emails: EmailMessage[] = [
      {
        to: input.email,
        tag: 'staff_invitation',
        ...staffInvitationEmail({
          byName: bootstrap ? null : by.name,
          until: untilText(expiresAt),
          url: link,
        }),
      },
    ]
    if (!bootstrap) {
      const notice = superAdminsChangedEmail({
        sentence: `${by.name} invited ${input.name} (${input.email}) to be a super-admin`,
        at: atText(now),
        reason: input.reason,
        activityUrl: webUrl('/console/activity'),
      })
      const others = await otherSuperAdmins(tx, by.userId ? [by.userId] : [])
      for (const o of others) emails.push({ to: o.email, tag: 'platform_notice', ...notice })
    }
    return { done, emails, ...(bootstrap && { link }) }
  })
}

type InvitationRow = typeof staffInvitations.$inferSelect

async function lockInvitation(tx: DbOrTx, invitationId: string): Promise<InvitationRow> {
  const [row] = await tx
    .select()
    .from(staffInvitations)
    .where(eq(staffInvitations.id, invitationId))
    .for('update')
  if (!row) throw new PlatformError('That invitation no longer exists.', 'not_found')
  return row
}

/** Pending or expired (stored either way): the two states Resend and Withdraw act on. */
const isOpenable = (row: InvitationRow): boolean =>
  row.status === 'pending' || row.status === 'expired'

/** A fresh link and 48 hours; a half-made account for it starts again (the forgotten-password way out). */
export async function resendStaffInvitation(
  db: DbOrTx,
  actor: PlatformActor,
  input: { invitationId: string },
  now = new Date(),
): Promise<StaffInvitationResult> {
  return db.transaction(async (tx) => {
    await lockPlatformAdmins(tx)
    await discardUnfinishedStaffAccounts(tx, now)
    const row = await lockInvitation(tx, input.invitationId)
    if (!isOpenable(row)) {
      throw new PlatformError(`${row.name}'s invitation was already accepted or withdrawn.`)
    }
    if (row.lastSentAt.getTime() > now.getTime() - STAFF_INVITATION_RESEND_MS) {
      throw new PlatformError('Wait a minute before resending.')
    }
    const expired = row.status === 'expired' || row.expiresAt <= now
    if (expired) {
      const [newer] = await tx
        .select({ id: staffInvitations.id, expiresAt: staffInvitations.expiresAt })
        .from(staffInvitations)
        .where(
          and(
            eq(staffInvitations.email, row.email),
            eq(staffInvitations.status, 'pending'),
            gt(staffInvitations.expiresAt, now),
            sql`${staffInvitations.id} <> ${row.id}`,
          ),
        )
      if (newer) {
        throw new PlatformError(
          `${row.email} already has an invitation that expires ${untilText(newer.expiresAt)}.`,
          'refused',
          { next: 'resend_invitation', invitationId: newer.id },
        )
      }
      if ((await openInvitationCount(tx, now)) >= STAFF_INVITATIONS_OPEN_MAX) {
        throw new PlatformError(
          `There are ${STAFF_INVITATIONS_OPEN_MAX} open invitations. Withdraw one or wait for it to be accepted.`,
        )
      }
    }
    await discardStaffAccountOf(tx, row.id)
    const { token, tokenHash } = newInvitationToken()
    const expiresAt = new Date(now.getTime() + STAFF_INVITATION_TTL_MS)
    await tx
      .update(staffInvitations)
      .set({
        status: 'pending',
        tokenHash,
        expiresAt,
        lastSentAt: now,
        userId: null,
        startedAt: null,
      })
      .where(eq(staffInvitations.id, row.id))
    const done = 'Invitation resent'
    await recordPlatformAudit(tx, {
      actor,
      action: 'superadmin.invitation_resent',
      targetType: 'staff_invitation',
      targetKey: row.id,
      after: { name: row.name, email: row.email, expiresAt: expiresAt.toISOString() },
      reason: row.reason,
      done,
    })
    const [inviter] = row.invitedByUserId
      ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row.invitedByUserId))
      : []
    const emails: EmailMessage[] = [
      {
        to: row.email,
        tag: 'staff_invitation',
        ...staffInvitationEmail({
          byName: inviter?.name ?? null,
          until: untilText(expiresAt),
          url: staffInvitationLink(token),
        }),
      },
    ]
    return { done, emails }
  })
}

export async function previewWithdraw(
  db: DbOrTx,
  input: { invitationId: string },
): Promise<Preview<{ status: 'pending' }>> {
  const [row] = await db
    .select({ name: staffInvitations.name, status: staffInvitations.status })
    .from(staffInvitations)
    .where(eq(staffInvitations.id, input.invitationId))
  if (!row) throw new PlatformError('That invitation no longer exists.', 'not_found')
  if (row.status !== 'pending' && row.status !== 'expired') {
    throw new PlatformError(`${row.name}'s invitation was already accepted or withdrawn.`)
  }
  return {
    lines: [{ text: `${row.name}'s link stops working at once.`, tone: 'info' }],
    expected: { status: 'pending' },
  }
}

/** Stops the link at once; a half-made account for it is discarded. */
export async function withdrawStaffInvitation(
  db: DbOrTx,
  actor: PlatformActor,
  input: { invitationId: string; reason: string },
  now = new Date(),
): Promise<StaffInvitationResult> {
  return db.transaction(async (tx) => {
    await lockPlatformAdmins(tx)
    const row = await lockInvitation(tx, input.invitationId)
    // Accepted or withdrawn since the confirm opened (the preview said pending).
    if (!isOpenable(row)) {
      const [by] = row.withdrawnByUserId
        ? await tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, row.withdrawnByUserId))
        : []
      throw new PlatformError(
        `${row.name}'s invitation was already ${row.status === 'accepted' ? 'accepted' : 'withdrawn'}.`,
        'stale',
        by ? { changedByName: by.name } : {},
      )
    }
    await discardStaffAccountOf(tx, row.id)
    await tx
      .update(staffInvitations)
      .set({
        status: 'withdrawn',
        respondedAt: now,
        withdrawnByUserId: actor.userId,
        userId: null,
        startedAt: null,
      })
      .where(eq(staffInvitations.id, row.id))
    await discardUnfinishedStaffAccounts(tx, now)
    const done = 'Invitation withdrawn'
    await recordPlatformAudit(tx, {
      actor,
      action: 'superadmin.invitation_withdrawn',
      targetType: 'staff_invitation',
      targetKey: row.id,
      before: { name: row.name, email: row.email },
      reason: input.reason,
      done,
    })
    return { done, emails: [] }
  })
}

/**
 * The code was verified at the staff sign-up (Better Auth's verify after-hook, setup mode): the
 * joining account becomes a super-admin and its invitation is accepted, in one transaction. Does
 * nothing when the invitation was withdrawn, resent or expired meanwhile (the sign-up page then
 * shows that, and the next staff action discards the account).
 */
export async function completeStaffJoin(
  db: DbOrTx,
  userId: string,
  operator: string | null,
  now = new Date(),
): Promise<{ joined: boolean; emails: EmailMessage[] }> {
  return db.transaction(async (tx) => {
    await lockPlatformAdmins(tx)
    const [invitation] = await tx
      .select()
      .from(staffInvitations)
      .where(and(eq(staffInvitations.userId, userId), openInvitation(now)))
      .for('update')
    const [person] = await tx
      .select({ name: users.name, email: users.email, accountKind: users.accountKind })
      .from(users)
      .where(eq(users.id, userId))
    if (!invitation || person?.accountKind !== 'staff') return { joined: false, emails: [] }
    const [already] = await tx
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
    if (!already) {
      await tx.insert(platformAdmins).values({
        userId,
        reason: invitation.reason,
        grantedByUserId: invitation.invitedByUserId,
      })
    }
    await tx
      .update(staffInvitations)
      .set({ status: 'accepted', respondedAt: now })
      .where(eq(staffInvitations.id, invitation.id))
    const actor: PlatformActor = { userId, name: person.name, channel: 'console', operator }
    await recordPlatformAudit(tx, {
      actor,
      action: 'superadmin.joined',
      targetType: 'staff_invitation',
      targetKey: invitation.id,
      after: { name: person.name, email: person.email },
      reason: invitation.reason,
      done: `${person.name} joined as a super-admin`,
    })
    const notice = superAdminsChangedEmail({
      sentence: `${person.name} joined as a Vento Real Estate super-admin`,
      at: atText(now),
      reason: invitation.reason,
      activityUrl: webUrl('/console/activity'),
    })
    const others = await otherSuperAdmins(tx, [userId])
    return {
      joined: true,
      emails: others.map((o): EmailMessage => ({ to: o.email, tag: 'platform_notice', ...notice })),
    }
  })
}

/** Open invitations, for the command's list. */
export async function listOpenInvitations(db: DbOrTx, now = new Date()) {
  return db
    .select({
      name: staffInvitations.name,
      email: staffInvitations.email,
      expiresAt: staffInvitations.expiresAt,
    })
    .from(staffInvitations)
    .where(openInvitation(now))
    .orderBy(staffInvitations.createdAt)
}
