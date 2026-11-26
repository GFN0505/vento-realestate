import { and, eq } from 'drizzle-orm'
import { webUrl } from '@/auth/hooks/deps'
import type { DbOrTx } from '@/db/client'
import { members, roles, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { newOwnerAlert } from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'

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
