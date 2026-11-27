import { toast } from 'sonner'
import { apiErrorMessage } from '@/lib/api-errors'
import { dataString, errorReason } from '@/lib/error-data'

/**
 * "There's already a request waiting for this." with **Open it** (spec acceptance criteria): the
 * server names the waiting request. Returns false for any other error.
 */
export function toastPendingRequest(error: unknown, open: (requestId: string) => void): boolean {
  if (errorReason(error) !== 'approval_pending') return false
  const requestId = dataString(error, 'requestId')
  toast(apiErrorMessage(error), {
    action: requestId ? { label: 'Open it', onClick: () => open(requestId) } : undefined,
  })
  return true
}
