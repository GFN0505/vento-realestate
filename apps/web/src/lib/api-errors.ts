import { ORPCError } from '@orpc/client'
import { toast } from 'sonner'
import { connection } from '@/lib/connection'
import { GENERIC_ERROR, NETWORK_ERROR } from '@/lib/error-copy'
import { isOrganizationChanged } from '@/lib/error-data'

export { errorReason, errorReference, isOrganizationChanged } from '@/lib/error-data'

/** A save tried with no connection. The form keeps its input (spec: never lose what was typed). */
export const OFFLINE_SAVE_ERROR =
  "You're offline, so this wasn't saved. What you typed is still here."

/**
 * Error toasts skip a refused session (the "Session expired" dialog already says it) and a tab
 * that's out of date (the page reloads into the right organization with its own notice).
 */
export function toastApiError(error: unknown) {
  if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') return
  if (isOrganizationChanged(error)) return
  toast.error(apiErrorMessage(error))
}

/**
 * Copy for a failed oRPC call. Known errors carry end-user copy from the spec in `message`;
 * anything else (a dropped connection, a 500) gets a calm generic line.
 */
export function apiErrorMessage(error: unknown): string {
  if (!connection.isOnline()) return OFFLINE_SAVE_ERROR
  if (error instanceof ORPCError) {
    return error.defined || error.status < 500 ? error.message : GENERIC_ERROR
  }
  return error instanceof TypeError ? NETWORK_ERROR : GENERIC_ERROR
}
