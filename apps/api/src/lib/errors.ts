import { ORPCError } from '@orpc/server'
import type {
  BadRequestReason,
  ConflictData,
  ConflictReason,
  CountLimitKey,
  ForbiddenReason,
} from '@vento/shared'

// Services throw these; oRPC formats them. Messages are end-user copy.

export function notFound(
  message = "We couldn't find that. It may have been removed.",
): ORPCError<'NOT_FOUND', undefined> {
  return new ORPCError('NOT_FOUND', { message })
}

/** A rule zod can't check (it needs the stored row), with the reason the web maps to a field. */
export function badRequest(reason: BadRequestReason, message: string) {
  return new ORPCError('BAD_REQUEST', { message, data: { reason } })
}

export function conflict(
  reason: ConflictReason,
  message: string,
  extra?: Omit<ConflictData, 'reason'>,
) {
  return new ORPCError('CONFLICT', { message, data: { reason, ...extra } })
}

/** Too soon to do this again; the web can say when to retry. */
export function tooManyRequests(message: string, retryAfterSeconds: number) {
  return new ORPCError('TOO_MANY_REQUESTS', {
    message,
    data: { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) },
  })
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

/** The guard triggers of migration 0008 (custom roles), named in their CONSTRAINT. */
export type GuardName =
  | 'members_role_not_archived'
  | 'invitations_role_not_archived'
  | 'roles_archive_unheld'

/**
 * A database guard trigger refused the write (check_violation naming the guard). The services
 * check first, so this only maps a race or a forgotten path to the same CONFLICT copy.
 */
export function isGuardViolation(error: unknown, name: GuardName): boolean {
  const e = findPgError(error)
  return e?.code === '23514' && e.constraint === name
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
