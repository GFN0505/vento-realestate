import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { toastApiError } from '@/lib/api-errors'
import { client } from '@/lib/orpc'
import { teamListKey } from '../team-queries'
import { inviteDraft } from './use-invite-draft'

/** "Already invited · Resend instead": resends that invitation and takes the row out. */
export function useResendInstead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => client.invitations.resend({ id }),
    onSuccess: (result, { email }) => {
      toast.success(
        result.outcome && !result.outcome.ran
          ? result.outcome.notice
          : `Invitation sent again to ${email}`,
      )
      inviteDraft.remove(email)
      void queryClient.invalidateQueries({ queryKey: teamListKey() })
    },
    onError: toastApiError,
  })
}
