import type { StaffInvitationRow, SuperAdminRow } from '@vento/shared/console'
import { consoleClient } from '../api'
import { ChangeDialog } from '../changes/change-dialog'
import { useChange } from '../changes/use-change'
import { firstName } from './queries'

const remove = consoleClient.console.superAdmins.remove
const reset = consoleClient.console.superAdmins.resetTwoStep
const withdraw = consoleClient.console.superAdmins.withdrawInvitation

/**
 * Remove (spec 1b): closes their staff account. Never on your own row; the API refuses it too.
 * The confirm's body is the server's preview (same sentences as the command), so no description.
 */
export function RemoveSuperAdminDialog({
  row,
  onClose,
}: {
  row: SuperAdminRow
  onClose: () => void
}) {
  const change = useChange(remove, onClose)
  return (
    <ChangeDialog
      open
      onClose={onClose}
      change={change}
      title={`Remove ${row.name} as a super-admin?`}
      confirmLabel={`Remove ${firstName(row.name)}`}
      destructive
      autoPreview={() => void change.preview({ userId: row.userId })}
    />
  )
}

/** Reset two-step (spec 1b): for someone who lost their phone. Nobody resets their own. */
export function ResetTwoStepDialog({ row, onClose }: { row: SuperAdminRow; onClose: () => void }) {
  const change = useChange(reset, onClose)
  return (
    <ChangeDialog
      open
      onClose={onClose}
      change={change}
      title={`Reset ${row.name}'s two-step?`}
      confirmLabel="Reset two-step"
      destructive
      autoPreview={() => void change.preview({ userId: row.userId })}
    />
  )
}

/** Withdraw (spec 1b): the link stops working at once. */
export function WithdrawInvitationDialog({
  invitation,
  onClose,
}: {
  invitation: StaffInvitationRow
  onClose: () => void
}) {
  const change = useChange(withdraw, onClose)
  return (
    <ChangeDialog
      open
      onClose={onClose}
      change={change}
      title={`Withdraw ${invitation.name}'s invitation?`}
      confirmLabel="Withdraw invitation"
      destructive
      autoPreview={() => void change.preview({ invitationId: invitation.id })}
    />
  )
}
