import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { toastPendingRequest } from '@/features/approvals/approval-errors'
import { approvalPreviewQuery } from '@/features/approvals/send/approval-preview'
import { SendForApprovalSheet } from '@/features/approvals/send/send-for-approval-sheet'
import { refreshApprovals } from '@/features/approvals/use-decide'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { teamListKey } from './team-queries'
import type { TeamConfirm } from './use-team-actions'

type Resend = Extract<TeamConfirm, { kind: 'resend-owner' }>

/**
 * Resending an owner invitation follows the "Make someone an owner" rules (brick 4 review): when
 * the server asks for a reason, this sheet asks **Why?** and sends it for approval. The
 * invitation stays as it is until the last approver says yes.
 */
export function ResendOwnerSheet({
  confirm,
  open,
  onClose,
  openRequest,
}: {
  confirm: Resend | null
  open: boolean
  onClose: () => void
  openRequest: (requestId: string) => void
}) {
  const queryClient = useQueryClient()
  const row = confirm?.row
  const preview = useQuery({
    ...approvalPreviewQuery('access.invitation.owner', { type: 'invitation', id: row?.id ?? '' }),
    enabled: open && row !== undefined,
  })
  const send = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.invitations.resend({ id, reason })
    },
    onSuccess: (result) => {
      toast.success(result.outcome?.notice ?? result.notice)
      void queryClient.invalidateQueries({ queryKey: teamListKey() })
      refreshApprovals(queryClient)
      onClose()
    },
    onError: (error) => {
      if (toastPendingRequest(error, openRequest)) onClose()
    },
  })
  const needed = preview.data?.needed ? preview.data : null
  return (
    <SendForApprovalSheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        send.reset()
        onClose()
      }}
      summary={
        <p>
          Send the owner invitation to <span className="font-semibold">{row?.email}</span> again.
          Owners can do everything, including changing who has access.
        </p>
      }
      chain={needed?.chain ?? null}
      blocked={needed?.blocked ?? null}
      pending={send.isPending}
      error={send.error}
      onSend={(reason) => row && send.mutate({ id: row.id, reason })}
    />
  )
}
