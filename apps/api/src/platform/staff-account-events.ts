import type { AuditAction } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, platformAuditEvents, users } from '@/db/schema'
import { requestScope } from '@/lib/request-scope'

/** The account event as `recordAccountEvent` gets it. */
export type StaffAccountEvent = {
  userId: string
  action: AuditAction
  actor: { userId: string | null; name: string }
  metadata?: Record<string, unknown> | null
}

const SECRET_KEY = /password|secret|token|code|backup/i

function withoutSecrets(value: Record<string, unknown> | null | undefined) {
  if (!value) return null
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)))
}

/**
 * A staff person's own account event (sign-in, two-step, passkey, console opened) has no
 * organization trail, so it goes to the platform trail with channel `account` (admin-console plan
 * §1b.4). Only once the person has ever been a super-admin: an unfinished sign-up writes nothing,
 * so discarding it is never blocked by history. Activity and the Dashboard leave these rows out.
 * True when a row was written.
 */
export async function recordStaffAccountEvent(
  db: DbOrTx,
  input: StaffAccountEvent,
): Promise<boolean> {
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, input.userId),
        eq(users.accountKind, 'staff'),
        sql`exists (select 1 from ${platformAdmins} where ${platformAdmins.userId} = ${users.id})`,
      ),
    )
  if (!person) return false
  const scope = requestScope()
  const operator = `${scope.userAgentSummary ?? 'Unknown browser'} · ${scope.ipMasked ?? 'unknown network'}`
  await db.insert(platformAuditEvents).values({
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    operator,
    channel: 'account',
    action: input.action,
    targetType: 'staff_account',
    targetKey: input.userId,
    reason: 'Account event',
    metadata: withoutSecrets(input.metadata),
  })
  return true
}
