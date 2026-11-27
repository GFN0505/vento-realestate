import type { StaffInvitationRow, SuperAdminRow } from '@vento/shared/console'
import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { webUrl } from '@/auth/hooks/deps'
import { STAFF_INVITATION_RESEND_MS } from '@/auth/policy'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, staffInvitations, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { superAdminRemovedEmail, superAdminsChangedEmail } from '@/email/templates/platform-notices'
import { twoStepResetAlert } from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'
import type { PlatformActor } from '../platform-audit'
import { otherSuperAdmins } from '../super-admins'

// The Super-admins page. Inviting, removing and resetting go through the same operations as the
// commands; the emails are returned and sent after the change commits.

const grantedBy = alias(users, 'granted_by')

export async function list(db: DbOrTx, viewerId: string): Promise<SuperAdminRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      since: platformAdmins.createdAt,
      grantedByName: grantedBy.name,
      lastConsoleAt: platformAdmins.lastConsoleAt,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .leftJoin(grantedBy, eq(grantedBy.id, platformAdmins.grantedByUserId))
    .where(isNull(platformAdmins.revokedAt))
    .orderBy(asc(platformAdmins.createdAt))
  return rows.map(({ twoFactorEnabled, ...r }) => ({
    ...r,
    since: r.since.toISOString(),
    lastConsoleAt: r.lastConsoleAt?.toISOString() ?? null,
    isYou: r.userId === viewerId,
    // Nobody resets their own; a reset person has nothing left to reset until they set it up.
    canResetTwoStep: r.userId !== viewerId && twoFactorEnabled,
  }))
}

async function person(db: DbOrTx, where: { email: string } | { userId: string }) {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      'email' in where
        ? eq(users.email, where.email.trim().toLowerCase())
        : eq(users.id, where.userId),
    )
  return row ?? null
}

const atText = (now: Date) => `${formatTime(now)} on ${formatDate(now)}`

function notice(sentence: string, reason: string, now: Date) {
  return superAdminsChangedEmail({
    sentence,
    at: atText(now),
    reason,
    activityUrl: webUrl('/console/activity'),
  })
}

/** After a removal: the person removed (their staff account is closed), and every other one. */
export async function removedEmails(
  db: DbOrTx,
  actor: PlatformActor,
  target: { userId: string },
  reason: string,
  now = new Date(),
): Promise<EmailMessage[]> {
  const removed = await person(db, target)
  if (!removed) return []
  const others = await otherSuperAdmins(db, [removed.id, actor.userId ?? ''])
  const words = notice(`${actor.name} removed ${removed.name} as a super-admin`, reason, now)
  return [
    {
      to: removed.email,
      tag: 'platform_notice',
      ...superAdminRemovedEmail({ byName: actor.name, at: atText(now) }),
    },
    ...others.map((o): EmailMessage => ({ to: o.email, tag: 'platform_notice', ...words })),
  ]
}

/**
 * After a two-step reset: the person gets the security alert (the password link follows from
 * Better Auth, or not at all for the break-glass command), every other super-admin a notice.
 */
export async function resetEmails(
  db: DbOrTx,
  actor: PlatformActor,
  target: { id: string; name: string; email: string },
  reason: string,
  now = new Date(),
): Promise<EmailMessage[]> {
  const others = await otherSuperAdmins(db, [target.id, actor.userId ?? ''])
  const words = notice(`${actor.name} reset ${target.name}'s two-step`, reason, now)
  return [
    { to: target.email, tag: 'security_alert', ...twoStepResetAlert({ byName: actor.name }) },
    ...others.map((o): EmailMessage => ({ to: o.email, tag: 'platform_notice', ...words })),
  ]
}

const invitedBy = alias(users, 'invited_by')
/** Expired invitations stay listed this long (they can still be resent or withdrawn). */
const EXPIRED_SHOWN_MS = 30 * 24 * 60 * 60_000

/** Open invitations and those expired in the last 30 days, newest first. */
export async function invitations(db: DbOrTx, now = new Date()): Promise<StaffInvitationRow[]> {
  const rows = await db
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      name: staffInvitations.name,
      invitedByName: invitedBy.name,
      expiresAt: staffInvitations.expiresAt,
      lastSentAt: staffInvitations.lastSentAt,
    })
    .from(staffInvitations)
    .leftJoin(invitedBy, eq(invitedBy.id, staffInvitations.invitedByUserId))
    .where(
      and(
        inArray(staffInvitations.status, ['pending', 'expired']),
        gt(staffInvitations.expiresAt, new Date(now.getTime() - EXPIRED_SHOWN_MS)),
      ),
    )
    .orderBy(desc(staffInvitations.createdAt))
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    invitedByName: r.invitedByName,
    expiresAt: r.expiresAt.toISOString(),
    status: r.expiresAt > now ? 'pending' : 'expired',
    resendableAt: new Date(r.lastSentAt.getTime() + STAFF_INVITATION_RESEND_MS).toISOString(),
  }))
}
