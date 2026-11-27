import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { consoleClient, consoleKey } from '../api'
import { changeFailure } from '../changes/change-errors'

/**
 * **Resend** (spec): no confirm, a new link and a fresh 48 hours. One key per press, so a retry
 * of the same press can't send twice; the server allows one resend a minute.
 */
export function useResendInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) =>
      consoleClient.console.superAdmins.resendInvitation({
        invitationId,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (done) => {
      toast.success(done.message)
      void queryClient.invalidateQueries({ queryKey: consoleKey() })
    },
    onError: (error) => {
      const failure = changeFailure(error)
      if (!failure.silent) toast.error(failure.message)
    },
  })
}
