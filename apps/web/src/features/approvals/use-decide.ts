import { ORPCError } from '@orpc/client'
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DecideInput, ListApprovalsOutput } from '@vento/shared'
import { toast } from 'sonner'
import { meQuery } from '@/features/account/api'
import { apiErrorMessage, OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { errorReason } from '@/lib/error-data'
import { client, orpc } from '@/lib/orpc'

/** Someone else decided first, it expired, or the record changed: move on to the next. */
const MOVED_ON = new Set(['approval_decided', 'approval_expired', 'approval_stale'])

/**
 * After a decision or a cancel: every tab, every open request and the top bar's count (`me`).
 */
export function refreshApprovals(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: orpc.approvals.key() })
  void queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
}

/**
 * Records that show "Waiting for approval" (the role page, Team): an approval can change them, a
 * cancel or reject clears their status.
 */
export function refreshRecords(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: orpc.roles.key() })
  void queryClient.invalidateQueries({ queryKey: orpc.team.key() })
}

/** Takes a decided request out of every cached Waiting for me page, so the list moves at once. */
function dropFromWaiting(queryClient: QueryClient, id: string) {
  queryClient.setQueriesData<ListApprovalsOutput>(
    { queryKey: orpc.approvals.list.key({ input: { tab: 'waiting' } }) },
    (data) => {
      if (!data?.items.some((r) => r.id === id)) return data
      return {
        ...data,
        items: data.items.filter((r) => r.id !== id),
        total: Math.max(0, data.total - 1),
        waitingCount: Math.max(0, data.waitingCount - 1),
      }
    },
  )
}

/**
 * Approve or reject the current step (spec flows). Success: the server's toast ("PO-2291
 * approved"), the row leaves Waiting for me and `onDone` opens the next. A lost race or an
 * expired request says what happened ("Aisha Bello approved this a moment ago.") and moves on
 * too. Offline nothing is sent or queued; the buttons say why they're off.
 */
export function useDecide(onDone: () => void, words: { title: string; makerName: string }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DecideInput) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.approvals.decide(input)
    },
    onSuccess: (_, input) => {
      // Short, past tense (ux-writing); the request names itself underneath.
      if (input.decision === 'approve') toast.success('Approved', { description: words.title })
      else toast.success('Rejected', { description: `${words.makerName} will see your comment` })
      dropFromWaiting(queryClient, input.requestId)
      refreshApprovals(queryClient)
      // Every decision moves the record on: it ran, it ended, or it now waits for the next step.
      refreshRecords(queryClient)
      onDone()
    },
    onError: (error, input) => {
      const reason = errorReason(error)
      if (reason && MOVED_ON.has(reason)) {
        toast(apiErrorMessage(error))
        dropFromWaiting(queryClient, input.requestId)
        refreshApprovals(queryClient)
        onDone()
        return
      }
      if (
        error instanceof ORPCError &&
        (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
      ) {
        // Their access changed, or it isn't theirs to decide any more: show what's true now.
        refreshApprovals(queryClient)
      }
      if (error instanceof Error && error.message === OFFLINE_SAVE_ERROR) {
        toast.error(OFFLINE_SAVE_ERROR)
        return
      }
      toastApiError(error)
    },
  })
}
