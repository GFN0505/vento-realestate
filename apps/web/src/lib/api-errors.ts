import { ORPCError } from '@orpc/client'
import { toast } from 'sonner'
import { connection } from '@/lib/connection'
import { GENERIC_ERROR, NETWORK_ERROR } from '@/lib/error-copy'
import { errorReason, isOrganizationChanged } from '@/lib/error-data'
import { reloadPage } from '@/lib/reload'

export { errorReason, errorReference, isOrganizationChanged } from '@/lib/error-data'

/** A save tried with no connection. The form keeps its input (spec: never lose what was typed). */
export const OFFLINE_SAVE_ERROR =
  "You're offline, so this wasn't saved. What you typed is still here."

/**
 * Error toasts skip a refused session (the "Session expired" dialog already says it) and a tab
 * that's out of date (the page reloads into the right organization with its own notice).
 */
export function toastApiError(error: unknown) {
  if (isHandledElsewhere(error)) return
  if (isAccessChanged(error)) {
    // Calm, not an error: their role changed under them; a reload shows what they may do now.
    toast(apiErrorMessage(error), {
      duration: Number.POSITIVE_INFINITY,
      action: { label: 'Reload', onClick: reloadPage },
    })
    return
  }
  toast.error(apiErrorMessage(error))
}

/** A write refused because the person's own access changed mid-action ("Reload the page…"). */
export function isAccessChanged(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    error.code === 'FORBIDDEN' &&
    errorReason(error) === 'access_changed'
  )
}

/** A refused session or an out-of-date tab: the shell already says so; forms stay quiet. */
export function isHandledElsewhere(error: unknown): boolean {
  return (
    (error instanceof ORPCError && error.code === 'UNAUTHORIZED') || isOrganizationChanged(error)
  )
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
