import { ORPCError } from '@orpc/client'

/*
 * Small readers for API errors. Kept apart from api-errors.ts (which carries the copy) so the
 * oRPC link and the route guards don't pull messages into the first-load bundle.
 */

export function dataString(error: unknown, field: string): string | null {
  if (!(error instanceof ORPCError)) return null
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null || !(field in data)) return null
  const value: unknown = (data as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : null
}

/** The `data.reason` of a CONFLICT or FORBIDDEN error, if any. */
export function errorReason(error: unknown): string | null {
  return dataString(error, 'reason')
}

/** The "ERR-7F3A-1126" reference the server attaches to a 500, if any. */
export function errorReference(error: unknown): string | null {
  return dataString(error, 'reference')
}

/** The tab names an organization the session no longer has (decision 0013). */
export function isOrganizationChanged(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    error.code === 'CONFLICT' &&
    errorReason(error) === 'organization_changed'
  )
}

/** NOT_FOUND: a missing record, or a whole feature the organization doesn't have (spec). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'NOT_FOUND'
}

/** A create refused because the organization's plan limit is reached (FORBIDDEN plan_limit). */
export function isPlanLimit(error: unknown): error is ORPCError<'FORBIDDEN', unknown> {
  return (
    error instanceof ORPCError && error.code === 'FORBIDDEN' && errorReason(error) === 'plan_limit'
  )
}

/** The request never reached the server (no connection, DNS, a dropped socket). */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError
}

/** A route's code chunk failed to download (deploy or dropped connection). */
export function isChunkLoadFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
      error.message,
    )
  )
}
