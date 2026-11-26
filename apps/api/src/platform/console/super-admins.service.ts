import type { SuperAdminRow } from '@vento/shared/console'
import { asc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { webUrl } from '@/auth/hooks/deps'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import {
  superAdminAddedEmail,
  superAdminRemovedEmail,
  superAdminsChangedEmail,
} from '@/email/templates/platform-notices'
import { formatDate, formatTime } from '@/lib/format'
import type { PlatformActor } from '../platform-audit'
import { otherSuperAdmins } from '../super-admins'

// The Super-admins page. Adding and removing go through the same operations as the commands;
// the emails are returned and sent after the change commits.

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
    })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .leftJoin(grantedBy, eq(grantedBy.id, platformAdmins.grantedByUserId))
    .where(isNull(platformAdmins.revokedAt))
    .orderBy(asc(platformAdmins.createdAt))
  return rows.map((r) => ({
    ...r,
    since: r.since.toISOString(),
    lastConsoleAt: r.lastConsoleAt?.toISOString() ?? null,
    isYou: r.userId === viewerId,
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

/** After a grant: the new super-admin, and every other one. */
export async function addedEmails(
  db: DbOrTx,
  actor: PlatformActor,
  target: { email: string },
  reason: string,
  now = new Date(),
): Promise<EmailMessage[]> {
  const added = await person(db, target)
  if (!added) return []
  const at = atText(now)
  const others = await otherSuperAdmins(db, [added.id, actor.userId ?? ''])
  const notice = superAdminsChangedEmail({
    sentence: `${actor.name} made ${added.name} a Vento super-admin`,
    at,
    reason,
    activityUrl: webUrl('/console/activity'),
  })
  return [
    {
      to: added.email,
      tag: 'platform_notice',
      ...superAdminAddedEmail({
        name: added.name,
        byName: actor.name,
        at,
        consoleUrl: webUrl('/console'),
      }),
    },
    ...others.map((o): EmailMessage => ({ to: o.email, tag: 'platform_notice', ...notice })),
  ]
}

/** After a removal: the person removed, and every other super-admin. */
export async function removedEmails(
  db: DbOrTx,
  actor: PlatformActor,
  target: { userId: string },
  reason: string,
  now = new Date(),
): Promise<EmailMessage[]> {
  const removed = await person(db, target)
  if (!removed) return []
  const at = atText(now)
  const others = await otherSuperAdmins(db, [removed.id, actor.userId ?? ''])
  const notice = superAdminsChangedEmail({
    sentence: `${actor.name} removed ${removed.name} as a Vento super-admin`,
    at,
    reason,
    activityUrl: webUrl('/console/activity'),
  })
  return [
    {
      to: removed.email,
      tag: 'platform_notice',
      ...superAdminRemovedEmail({ byName: actor.name, at }),
    },
    ...others.map((o): EmailMessage => ({ to: o.email, tag: 'platform_notice', ...notice })),
  ]
}
