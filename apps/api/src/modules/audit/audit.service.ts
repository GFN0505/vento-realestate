import type { AuditAction } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { auditEvents, members } from '@/db/schema'
import { logger } from '@/lib/logger'
import { requestScope } from '@/lib/request-scope'
import { recordStaffAccountEvent } from '@/platform/staff-account-events'

export type AuditActor = { userId: string | null; name: string }

export type AuditTarget = { type: string; id?: string | null; label?: string | null }

export type AuditInput = {
  organizationId: string
  action: AuditAction
  actor: AuditActor
  target: AuditTarget
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

const SECRET_KEY = /password|secret|token|code|backup/i

/** Drops any key that could hold a secret, at any depth, so it can never reach the audit trail. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, v]) => [key, redact(v)]),
    )
  }
  return value
}

function row(input: AuditInput) {
  const scope = requestScope()
  return {
    organizationId: input.organizationId,
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    action: input.action,
    targetType: input.target.type,
    targetId: input.target.id ?? null,
    targetLabel: input.target.label ?? null,
    before: input.before ? redact(input.before) : null,
    after: input.after ? redact(input.after) : null,
    metadata: input.metadata ? redact(input.metadata) : null,
    requestId: scope.requestId,
    ipMasked: scope.ipMasked,
    userAgentSummary: scope.userAgentSummary,
  }
}

/** Writes one event. Call it inside the same transaction as the change it records. */
export async function recordAudit(db: DbOrTx, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values(row(input))
}

/**
 * Events about a person's account (sign-ins, lockouts, password and two-step changes) are
 * written once per organization they're an active member of, so each one's owners see them.
 * Before they belong to any organization, only a log line is kept, with no personal data;
 * a staff account's events go to the platform trail instead.
 */
export async function recordAccountEvent(
  db: DbOrTx,
  input: Omit<AuditInput, 'organizationId' | 'target'> & {
    userId: string
    target?: AuditTarget
  },
): Promise<number> {
  const memberships = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(and(eq(members.userId, input.userId), eq(members.status, 'active')))
  const organizationIds = memberships.map((m) => m.organizationId)
  if (organizationIds.length === 0) {
    // A staff account has no organization trail: its events go to the platform trail.
    if (await recordStaffAccountEvent(db, input)) return 1
    logger.info('Account event before any organization', {
      action: input.action,
      requestId: requestScope().requestId,
    })
    return 0
  }
  const target = input.target ?? { type: 'user', id: input.userId }
  await db
    .insert(auditEvents)
    .values(organizationIds.map((organizationId) => row({ ...input, organizationId, target })))
  return organizationIds.length
}
