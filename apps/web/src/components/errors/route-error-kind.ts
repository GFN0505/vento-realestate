import { ORPCError } from '@orpc/client'
import { ModuleForbiddenError } from '@/features/shell/module-forbidden-error'
import { errorReason, isChunkLoadFailure, isNetworkFailure } from '@/lib/error-data'

export type RouteErrorKind =
  /** The role can't view this module: the 403 page naming who can grant access. */
  | 'forbidden'
  /** The server says two-step must be set up first: re-run the guard, which redirects. */
  | 'two_step'
  /** Another refusal (e.g. "only owners can…"): the server's own message as a toast. */
  | 'toast'
  | 'not_found'
  | 'offline'
  /** A page's code failed to download while online: likely a new deploy (see chunk-errors). */
  | 'stale_code'
  | 'server'

/** How a route's error is shown (plan 6.1). Pure, so every branch is tested. */
export function routeErrorKind(
  error: unknown,
  { inShell, online }: { inShell: boolean; online: boolean },
): RouteErrorKind {
  if (error instanceof ModuleForbiddenError) return inShell ? 'forbidden' : 'server'
  if (error instanceof ORPCError && error.code === 'FORBIDDEN') {
    const reason = errorReason(error)
    if (reason === 'two_step_setup_required') return 'two_step'
    if (reason === 'permission' && inShell) return 'forbidden'
    return 'toast'
  }
  if (inShell && error instanceof ORPCError && error.code === 'NOT_FOUND') return 'not_found'
  if (isChunkLoadFailure(error)) return online ? 'stale_code' : 'offline'
  if (isNetworkFailure(error) || !online) return 'offline'
  return 'server'
}
