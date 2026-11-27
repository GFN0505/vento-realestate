import type { StaffInvitationRow, SuperAdminRow } from '@vento/shared/console'
import { consoleClient } from '../api'
import { ChangeDialog } from '../changes/change-dialog'
import { useChange } from '../changes/use-change'
import { firstName } from './queries'

const remove = consoleClient.console.superAdmins.remove
const reset = consoleClient.console.superAdmins.resetTwoStep
const withdraw = consoleClient.console.superAdmins.withdrawInvitation

/** Remove (spec 1b): closes their staff account. Never on your own row; the API refuses it too. */
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
      description="Their staff account closes: they're signed out everywhere and can't sign in. Their name stays on past activity."
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
      description="They're signed out everywhere, their passkeys are removed, and they get an email to set a new password. They set up two-step again at their next sign-in."
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
      description="The link stops working at once."
      confirmLabel="Withdraw invitation"
      destructive
      autoPreview={() => void change.preview({ invitationId: invitation.id })}
    />
  )
}
