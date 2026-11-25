import { ORPCError } from '@orpc/client'
import { toast } from 'sonner'
import { GENERIC_ERROR, NETWORK_ERROR } from '@/lib/auth-errors'

/**
 * Copy for a failed oRPC call. Known errors carry end-user copy from the spec in `message`;
 * anything else (a dropped connection, a 500) gets a calm generic line.
 */
/** Error toasts skip a refused session: the "Session expired" dialog already says it. */
export function toastApiError(error: unknown) {
  if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') return
  toast.error(apiErrorMessage(error))
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    return error.defined || error.status < 500 ? error.message : GENERIC_ERROR
  }
  return error instanceof TypeError ? NETWORK_ERROR : GENERIC_ERROR
}

/** The `data.reason` of a CONFLICT or FORBIDDEN error, if any. */
export function errorReason(error: unknown): string | null {
  if (!(error instanceof ORPCError)) return null
  const data: unknown = error.data
  return typeof data === 'object' &&
    data !== null &&
    'reason' in data &&
    typeof data.reason === 'string'
    ? data.reason
    : null
}
