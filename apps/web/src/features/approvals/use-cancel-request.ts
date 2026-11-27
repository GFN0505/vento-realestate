import { useMutation, useQueryClient } from '@tanstack/react-query'
import { APPROVAL_COPY } from '@vento/shared'
import { toast } from 'sonner'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { refreshApprovals, refreshRecords } from './use-decide'

/**
 * **Cancel my request** (inbox) and **Cancel request** (on the record): the maker only, while it
 * waits. Nothing had changed, so nothing needs putting back; the record's status clears.
 */
export function useCancelRequest(onCancelled?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.approvals.cancel({ id })
    },
    onSuccess: () => {
      toast.success(APPROVAL_COPY.requestCancelled)
      refreshApprovals(queryClient)
      refreshRecords(queryClient)
      onCancelled?.()
    },
    onError: (error) => {
      // Decided or expired meanwhile: the fresh copy says so.
      refreshApprovals(queryClient)
      refreshRecords(queryClient)
      toastApiError(error)
    },
  })
}
