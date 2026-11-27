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

/** A rule applies but nobody else can approve (the only owner): it goes ahead, noted. */
export const NO_ONE_ELSE =
  'No one else can approve this, so it takes effect now and is noted in the audit log.'

/** The Make owner preview, fetched before the confirm opens so it opens in its final form. */
export function ownerPreviewQuery(memberId: string) {
  return approvalPreviewQuery('access.member.make_owner', { type: 'member', id: memberId })
}

type Props = {
  confirm: Owner | null
  open: boolean
  organization: string
  onClose: () => void
  openRequest: (requestId: string) => void
}

/**
 * Make owner (spec 3b, brick 4), in one step: when the "Make someone an owner" rule applies, the
 * Send for approval sheet opens instead of the confirm, and the row stays as it is until the last
 * approver says yes. When nobody else could approve (the only owner), the confirm says it takes
 * effect now. If we can't find out which, it says so and offers Try again.
 * A refusal (e.g. "Nobody else can approve this…") stays in the dialog.
 */
export function OwnerConfirm({ confirm, open, organization, onClose, openRequest }: Props) {
  const queryClient = useQueryClient()
  const row = confirm?.row
  const options = ownerPreviewQuery(row?.id ?? '')
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
  // The team page fetched the answer before opening; nothing flashes while it's on its way.
  if (open && preview.isPending) return null

  if (needed && !needed.proceedsWithoutApprover && confirm) {
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
      pending={open && (apply.isPending || preview.isFetching)}
      onConfirm={() => {
        if (preview.isError) return void preview.refetch()
        if (confirm) apply.mutate({ confirm })
      }}
    >
      {needed?.proceedsWithoutApprover
        ? NO_ONE_ELSE
        : `Owners can do everything in ${organization}, including changing who has access and removing other owners.`}
      {problem && (
        <span role="alert" className="mt-2 block text-status-rose-fg">
          {problem}
        </span>
      )}
    </ConfirmDialog>
  )
}
