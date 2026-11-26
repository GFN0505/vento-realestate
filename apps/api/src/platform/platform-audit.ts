import type { AuditAction } from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { organizations, platformAuditEvents } from '@/db/schema'
import { recordAudit } from '@/modules/audit/audit.service'

/** Who made a platform change: a super-admin (or a scheduled run) and the machine user. */
export type PlatformActor = {
  /** null = a scheduled run. */
  userId: string | null
  name: string
  /** `os-user@host` that ran the command. */
  operator: string | null
}

export const SCHEDULED_ACTOR: PlatformActor = {
  userId: null,
  name: 'Vento (scheduled)',
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
  },
): Promise<void> {
  await db.insert(platformAuditEvents).values({
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    operator: input.actor.operator,
    action: input.action,
    targetType: input.targetType,
    targetKey: input.targetKey,
    organizationId: input.organizationId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason,
    metadata: input.metadata ?? null,
  })
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
