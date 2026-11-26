import { and, desc, eq } from 'drizzle-orm'
import { webUrl } from '@/auth/hooks/deps'
import { organizations, platformAuditEvents } from '@/db/schema'
import { type EmailMessage, sendAll } from '@/email/mailer'
import { breakGlassEmail } from '@/email/templates/platform-notices'
import { formatDate, formatTime } from '@/lib/format'
import { logger } from '@/lib/logger'
import { describePlatformEvent } from '../operations/describe'
import { otherSuperAdmins } from '../super-admins'
import { type BreakGlassChange, type CommandDeps, commandRowCount } from './context'

/** "ada@api-1" → "api-1". */
function hostOf(operator: string | null): string | null {
  const host = operator?.split('@')[1]?.trim()
  return host || null
}

/** The audit rows one break-glass change wrote (its newest command rows), with organization names. */
async function rowsOf(deps: CommandDeps, change: BreakGlassChange) {
  const written = (await commandRowCount(deps.db, change.actor)) - change.rowsBefore
  if (written <= 0 || !change.actor.userId) return []
  return deps.db
    .select({
      action: platformAuditEvents.action,
      targetType: platformAuditEvents.targetType,
      targetKey: platformAuditEvents.targetKey,
      before: platformAuditEvents.before,
      after: platformAuditEvents.after,
      reason: platformAuditEvents.reason,
      organizationName: organizations.name,
    })
    .from(platformAuditEvents)
    .leftJoin(organizations, eq(organizations.id, platformAuditEvents.organizationId))
    .where(
      and(
        eq(platformAuditEvents.actorUserId, change.actor.userId),
        eq(platformAuditEvents.channel, 'command'),
      ),
    )
    .orderBy(desc(platformAuditEvents.createdAt), desc(platformAuditEvents.id))
    .limit(written)
}

/** The emails for one change: every other active super-admin, never the person who made it. */
export async function breakGlassMessages(
  deps: CommandDeps,
  change: BreakGlassChange,
): Promise<EmailMessage[]> {
  const rows = await rowsOf(deps, change)
  const first = rows.at(-1)
  if (!first) return []
  const { summary } = describePlatformEvent(first)
  const now = deps.now()
  const email = breakGlassEmail({
    actorName: change.actor.name,
    summary: rows.length > 1 ? `${summary} and ${rows.length - 1} more changes` : summary,
    host: hostOf(change.actor.operator),
    at: `${formatTime(now)} on ${formatDate(now)}`,
    reason: first.reason,
    activityUrl: webUrl('/console/activity'),
  })
  const others = await otherSuperAdmins(deps.db, change.actor.userId ? [change.actor.userId] : [])
  return others.map((o) => ({ to: o.email, tag: 'platform_notice', ...email }))
}

/**
 * After the command has run (its transactions committed): tells the other super-admins about each
 * break-glass change. Never fails the command; failed sends are logged without addresses.
 */
export async function announceBreakGlass(
  deps: CommandDeps,
  changes: readonly BreakGlassChange[],
): Promise<void> {
  for (const change of changes) {
    try {
      await sendAll(deps.mailer, await breakGlassMessages(deps, change))
    } catch (error) {
      logger.error('Could not announce a break-glass change', {
        command: change.command,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
