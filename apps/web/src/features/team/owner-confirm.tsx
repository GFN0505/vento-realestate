import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { APPROVAL_COPY } from '@vento/shared'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { approvalPreviewQuery } from '@/features/approvals/send/approval-preview'
import { SendForApprovalSheet } from '@/features/approvals/send/send-for-approval-sheet'
import { refreshApprovals } from '@/features/approvals/use-decide'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
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
  /** No rule applies: make them an owner now, as before brick 4. */
  onConfirm: (confirm: Owner) => void
}

/**
 * Make owner (spec 3b, brick 4). When the "Make someone an owner" rule applies, the confirm is
 * the Send for approval sheet instead: the row stays as it is until the last approver says yes.
 */
export function OwnerConfirm({ confirm, open, organization, onClose, onConfirm }: Props) {
  const queryClient = useQueryClient()
  const row = confirm?.row
  const options = approvalPreviewQuery('access.member.make_owner', {
    type: 'member',
    id: row?.id ?? '',
  })
  const preview = useQuery({ ...options, enabled: open && row !== undefined })
  const request = useMutation({
    mutationFn: ({ confirm, reason }: { confirm: Owner; reason: string }) => {
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
      toast.success(result.outcome?.notice ?? result.notice)
      void queryClient.invalidateQueries({ queryKey: teamListKey() })
      void queryClient.invalidateQueries({ queryKey: options.queryKey })
      refreshApprovals(queryClient)
      onClose()
      confirm.onRequested?.()
    },
  })
  const needed = preview.data?.needed ? preview.data : null

  if (needed && confirm) {
    return (
      <SendForApprovalSheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        summary={
          <p>
            Make <span className="font-semibold">{confirm.row.name}</span> an owner of{' '}
            {organization}. Owners can do everything, including changing who has access.
          </p>
        }
        chain={needed.chain}
        blocked={needed.pendingRequestId ? APPROVAL_COPY.alreadyPending : needed.blocked}
        pending={request.isPending}
        error={request.error}
        onSend={(reason) => request.mutate({ confirm, reason })}
      />
    )
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={row ? `Make ${row.name} an owner?` : ''}
      confirmLabel="Make owner"
      // A moment while we check whether this needs approval first.
      pending={open && preview.isPending}
      onConfirm={() => confirm && onConfirm(confirm)}
    >
      Owners can do everything in {organization}, including changing who has access and removing
      other owners.
    </ConfirmDialog>
  )
}
