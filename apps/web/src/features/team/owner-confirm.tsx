import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { APPROVAL_COPY } from '@vento/shared'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { toastPendingRequest } from '@/features/approvals/approval-errors'
import { approvalPreviewQuery } from '@/features/approvals/send/approval-preview'
import { SendForApprovalSheet } from '@/features/approvals/send/send-for-approval-sheet'
import { refreshApprovals } from '@/features/approvals/use-decide'
import { apiErrorMessage, isHandledElsewhere, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { errorReason } from '@/lib/error-data'
import { client } from '@/lib/orpc'
import { teamListKey } from './team-queries'
import { currentEntityIds } from './use-change-role'
import type { TeamConfirm } from './use-team-actions'

type Owner = Extract<TeamConfirm, { kind: 'owner' }>

type Props = {
  confirm: Owner | null
  open: boolean
  organization: string
  onClose: () => void
  openRequest: (requestId: string) => void
}

/**
 * Make owner (spec 3b, brick 4). When the "Make someone an owner" rule applies, the confirm is
 * the Send for approval sheet instead: the row stays as it is until the last approver says yes.
 * Until we know which, Confirm waits; if we can't find out, it says so and offers Try again.
 * A refusal (e.g. "Nobody else can approve this…") stays in the dialog.
 */
export function OwnerConfirm({ confirm, open, organization, onClose, openRequest }: Props) {
  const queryClient = useQueryClient()
  const row = confirm?.row
  const options = approvalPreviewQuery('access.member.make_owner', {
    type: 'member',
    id: row?.id ?? '',
  })
  const preview = useQuery({ ...options, enabled: open && row !== undefined })
  const apply = useMutation({
    mutationFn: ({ confirm, reason }: { confirm: Owner; reason?: string }) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.members.updateAccess({
        memberId: confirm.row.id,
        roleId: confirm.role.id,
        entityIds:
          confirm.entityIds === undefined ? currentEntityIds(confirm.row) : confirm.entityIds,
        reason,
      })
    },
    onSuccess: (result, { confirm }) => {
      const outcome = result.outcome
      toast.success(
        outcome && !outcome.ran ? outcome.notice : `${confirm.row.name} is now an owner`,
      )
      void queryClient.invalidateQueries({ queryKey: teamListKey() })
      void queryClient.invalidateQueries({ queryKey: options.queryKey })
      refreshApprovals(queryClient)
      onClose()
      confirm.onDone?.()
    },
    onError: (error) => {
      if (toastPendingRequest(error, openRequest)) return onClose()
      // A rule appeared meanwhile: the preview catches up and the send sheet takes over.
      if (errorReason(error) === 'reason_required') {
        void queryClient.invalidateQueries({ queryKey: options.queryKey })
      }
    },
  })
  const close = () => {
    apply.reset()
    onClose()
  }
  const needed = preview.data?.needed ? preview.data : null

  if (needed && confirm) {
    return (
      <SendForApprovalSheet
        open={open}
        onOpenChange={(next) => !next && close()}
        summary={
          <p>
            Make <span className="font-semibold">{confirm.row.name}</span> an owner of{' '}
            {organization}. Owners can do everything, including changing who has access.
          </p>
        }
        chain={needed.chain}
        blocked={needed.pendingRequestId ? APPROVAL_COPY.alreadyPending : needed.blocked}
        pending={apply.isPending}
        error={apply.error}
        onSend={(reason) => apply.mutate({ confirm, reason })}
      />
    )
  }
  const problem = preview.isError
    ? "We couldn't check whether this needs approval. Check your connection and try again."
    : apply.error &&
        !isHandledElsewhere(apply.error) &&
        errorReason(apply.error) !== 'reason_required'
      ? apiErrorMessage(apply.error)
      : null
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={row ? `Make ${row.name} an owner?` : ''}
      confirmLabel={preview.isError ? 'Try again' : 'Make owner'}
      // Confirm waits until we know whether this needs approval first.
      pending={open && (preview.isPending || apply.isPending || preview.isFetching)}
      onConfirm={() => {
        if (preview.isError) return void preview.refetch()
        if (confirm) apply.mutate({ confirm })
      }}
    >
      Owners can do everything in {organization}, including changing who has access and removing
      other owners.
      {problem && (
        <span role="alert" className="mt-2 block text-status-rose-fg">
          {problem}
        </span>
      )}
    </ConfirmDialog>
  )
}
