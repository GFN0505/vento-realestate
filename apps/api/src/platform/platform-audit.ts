import type { AuditAction } from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { organizations, platformAuditEvents } from '@/db/schema'
import { recordAudit } from '@/modules/audit/audit.service'

/** Where a platform change came from (admin-console plan §6.3). */
export type PlatformChannel = 'console' | 'command' | 'scheduled'

/** Who made a platform change, from where, and (console) the key that makes a retry safe. */
export type PlatformActor = {
  /** null = a scheduled run or the seed. */
  userId: string | null
  name: string
  channel: PlatformChannel
  /** `os-user@host` for a command; "console · Chrome on Mac · 102.89.34.x" for the console. */
  operator: string | null
  /** One per confirmed console change: the same key never applies twice. */
  idempotencyKey?: string
  /** The console request the key was made for (procedure and input, hashed). */
  requestHash?: string
}

export const SCHEDULED_ACTOR: PlatformActor = {
  userId: null,
  name: 'Vento (scheduled)',
  channel: 'scheduled',
  operator: null,
}

export type PlatformAuditAction =
  | 'release.stage_changed'
  | 'release.group_changed'
  | 'release.override_set'
  | 'release.override_cleared'
  | 'plan.published'
  | 'plan.assigned'
  | 'plan.trial_started'
  | 'plan.trial_ended'
  | 'plan.trial_cancelled'
  | 'plan.add_on_added'
  | 'plan.add_on_changed'
  | 'plan.add_on_removed'
  | 'plan.feature_overridden'
  | 'plan.limit_overridden'
  | 'plan.override_cleared'
  | 'superadmin.granted'
  | 'superadmin.revoked'

/** Vento's own trail. Call inside the change's transaction. */
export async function recordPlatformAudit(
  db: DbOrTx,
  input: {
    actor: PlatformActor
    action: PlatformAuditAction
    targetType: 'feature' | 'plan' | 'organization' | 'user'
    targetKey: string | null
    organizationId?: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    reason: string
    metadata?: Record<string, unknown> | null
    /** The operation's answer, so a retried console request can return it without running again. */
    done?: string
  },
): Promise<void> {
  const extra = {
    ...(input.done !== undefined && { done: input.done }),
    ...(input.actor.requestHash && { request: input.actor.requestHash }),
  }
  const metadata = Object.keys(extra).length
    ? { ...input.metadata, ...extra }
    : (input.metadata ?? null)
  await db.insert(platformAuditEvents).values({
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    operator: input.actor.operator,
    channel: input.actor.channel,
    idempotencyKey: input.actor.idempotencyKey ?? null,
    action: input.action,
    targetType: input.targetType,
    targetKey: input.targetKey,
    organizationId: input.organizationId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason,
    metadata,
  })
}

/** The change a console idempotency key already made: who, and the answer it gave. */
export async function findByIdempotencyKey(
  db: DbOrTx,
  key: string,
): Promise<{ actorUserId: string | null; done: string; request: string | null } | null> {
  const [row] = await db
    .select({
      actorUserId: platformAuditEvents.actorUserId,
      metadata: platformAuditEvents.metadata,
    })
    .from(platformAuditEvents)
    .where(eq(platformAuditEvents.idempotencyKey, key))
  if (!row) return null
  const meta = row.metadata as { done?: unknown; request?: unknown } | null
  return {
    actorUserId: row.actorUserId,
    done: typeof meta?.done === 'string' ? meta.done : 'Done.',
    request: typeof meta?.request === 'string' ? meta.request : null,
  }
}

/**
 * The organization's own trail, in plain words ("Vento moved your organization to Growth").
 * The actor is "Vento": never the staff member, and never Vento's internal reason.
 */
export async function recordOrganizationNotice(
  db: DbOrTx,
  input: {
    organizationId: string
    action: AuditAction
    message: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
  },
): Promise<void> {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
  await recordAudit(db, {
    organizationId: input.organizationId,
    action: input.action,
    actor: { userId: null, name: 'Vento' },
    target: { type: 'organization', id: input.organizationId, label: org?.name ?? null },
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: { message: input.message },
  })
}
