import { and, desc, eq } from 'drizzle-orm'
import { webUrl } from '@/auth/hooks/deps'
import { organizations, platformAuditEvents, users } from '@/db/schema'
import { type EmailMessage, sendAll } from '@/email/mailer'
import { breakGlassEmail } from '@/email/templates/platform-notices'
import { env } from '@/env'
import { formatDate, formatTime } from '@/lib/format'
import { logger } from '@/lib/logger'
import { describePlatformEvent } from '../operations/describe'
import { otherSuperAdmins } from '../super-admins'
import { type BreakGlassChange, type CommandDeps, commandRowCount } from './context'

/**
 * The machine a command ran on, from either operator form: "ada@api-1", "ada@api-1 from 102.89.34.x",
 * "Ada (ada@api-1)" or "ada via sudo (deploy@api-1)" → "api-1".
 */
export function hostOf(operator: string | null): string | null {
  const match = operator?.match(/@([A-Za-z0-9.-]+)/)
  return match?.[1] ?? null
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

/** The emails for one change: every other active super-admin, the --by person, and the fallback. */
export async function breakGlassMessages(
  deps: CommandDeps,
  change: BreakGlassChange,
): Promise<EmailMessage[]> {
  const rows = await rowsOf(deps, change)
  const first = rows.at(-1)
  if (!first) return []
  const { summary } = describePlatformEvent(first)
  const now = deps.now()
  const words = {
    actorName: change.actor.name,
    summary: rows.length > 1 ? `${summary} and ${rows.length - 1} more changes` : summary,
    host: hostOf(change.actor.operator),
    at: `${formatTime(now)} on ${formatDate(now)}`,
    reason: first.reason,
    activityUrl: webUrl('/console/activity'),
  }
  const notice = breakGlassEmail(words)
  const actorId = change.actor.userId
  const others = await otherSuperAdmins(deps.db, actorId ? [actorId] : [])
  const messages: EmailMessage[] = others.map((o) => ({
    to: o.email,
    tag: 'platform_notice',
    ...notice,
  }))
  // The --by person too: whoever has host access can type their name (audit M2).
  const [actor] = actorId
    ? await deps.db.select({ email: users.email }).from(users).where(eq(users.id, actorId))
    : []
  if (actor) {
    messages.push({
      to: actor.email,
      tag: 'platform_notice',
      ...breakGlassEmail({ ...words, toActor: true }),
    })
  }
  if (others.length === 0) {
    const security =
      deps.securityAlertEmail === undefined ? env.SECURITY_ALERT_EMAIL : deps.securityAlertEmail
    if (security) messages.push({ to: security, tag: 'platform_notice', ...notice })
    else
      logger.warn(
        'No other super-admin to tell about a break-glass change, and SECURITY_ALERT_EMAIL is unset',
        { command: change.command },
      )
  }
  return messages
}

/**
 * After the command has run (its transactions committed): tells the other super-admins, the --by
 * person and, when there's nobody else, Vento's security inbox about each break-glass change. Never fails the command; failed sends are logged without addresses.
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
