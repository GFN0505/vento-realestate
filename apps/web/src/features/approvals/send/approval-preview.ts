import type { ApprovalActionKey } from '@vento/shared'
import { orpc } from '@/lib/orpc'

/**
 * Would this action on this record need approval, by whom, and is a request already waiting?
 * Drives the save bar's words, the send sheet's chain and the record's "Waiting for approval".
 */
export function approvalPreviewQuery(
  actionKey: ApprovalActionKey,
  subject: { type: string; id: string },
) {
  return orpc.approvals.preview.queryOptions({
    input: { actionKey, subject },
    staleTime: 30_000,
  })
}
