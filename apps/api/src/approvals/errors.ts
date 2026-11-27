import {
  APPROVAL_COPY,
  decidedMomentAgoMessage,
  noApproverMessage,
  staleMessage,
} from '@vento/shared'
import { badRequest, conflict, forbidden } from '@/lib/errors'

/**
 * Thrown by a plug-in's execute when the record changed since the request was made (a role saved
 * meanwhile, an invitation already sent). The engine expires the request instead of applying an
 * out-of-date change.
 */
export class StaleError extends Error {
  constructor(detail = 'The record changed after the request was made') {
    super(detail)
    this.name = 'StaleError'
  }
}

export const reasonRequired = () => badRequest('reason_required', APPROVAL_COPY.reasonRequired)

export const alreadyPending = (requestId: string) =>
  conflict('approval_pending', APPROVAL_COPY.alreadyPending, { requestId })

export const requestExpired = () => conflict('approval_expired', APPROVAL_COPY.expired)

export const requestStale = (recordLabel: string) =>
  conflict('approval_stale', staleMessage(recordLabel))

export const decidedMomentAgo = (name: string, decision: 'approve' | 'reject') =>
  conflict('approval_decided', decidedMomentAgoMessage(name, decision), { changedByName: name })

export const notPending = (message = 'This request has already ended.') =>
  conflict('approval_not_pending', message)

export const noApprover = (entityName: string | null) =>
  conflict('no_approver', noApproverMessage(entityName))

export const ownRequest = () =>
  forbidden(
    'own_request',
    'This is your own request, so someone else approves it. You can cancel it while it waits.',
  )

export const notEligible = (message: string) => forbidden('not_eligible', message)
