import { ORPCError } from '@orpc/server'
import type { ConflictReason, CountLimitKey, ForbiddenReason } from '@vento/shared'

// Services throw these; oRPC formats them. Messages are end-user copy.

export function notFound(): ORPCError<'NOT_FOUND', undefined> {
  return new ORPCError('NOT_FOUND', { message: "We couldn't find that. It may have been removed." })
}

export function conflict(reason: ConflictReason, message: string) {
  return new ORPCError('CONFLICT', { message, data: { reason } })
}

/** The tab names another organization than the session (decision 0013); the web reloads. */
export function organizationChanged() {
  return conflict(
    'organization_changed',
    'This tab is showing a different organization. Reloading…',
  )
}

export function forbidden(
  reason: ForbiddenReason,
  message: string,
  ask?: { askName: string; askRole: string },
) {
  return new ORPCError('FORBIDDEN', { message, data: { reason, ...ask } })
}

/**
 * A create would go over the plan's limit. The message is built for the caller's role
 * (owners get what to do; others get who to ask) and never names a price.
 */
export function planLimit(
  message: string,
  data: { limit: CountLimitKey; included: number; askName?: string; askRole?: string },
) {
  return new ORPCError('FORBIDDEN', { message, data: { reason: 'plan_limit' as const, ...data } })
}

/** Postgres unique_violation, optionally on a named constraint or index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = findPgError(error)
  return e?.code === '23505' && (!constraint || e.constraint === constraint)
}

type PgError = { code?: string; constraint?: string }

// Drizzle wraps driver errors; the pg error is on `cause`.
function findPgError(error: unknown): PgError | undefined {
  let current: unknown = error
  for (let i = 0; i < 3 && current && typeof current === 'object'; i++) {
    const candidate = current as PgError & { cause?: unknown }
    if (typeof candidate.code === 'string') return candidate
    current = candidate.cause
  }
  return undefined
}
