import { useRef } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useMe } from '@/features/preview/use-effective-permissions'
import { useTeamActionsContext } from './use-team-actions'

/** The three confirms (spec UI copy): remove, reset two-step and make owner. */
export function TeamConfirms() {
  const actions = useTeamActionsContext()
  const organization = useMe().organization?.name ?? 'the organization'
  const open = actions.confirm?.kind ?? null
  // The last confirm keeps its words while the dialog animates out.
  const last = useRef(actions.confirm)
  if (actions.confirm) last.current = actions.confirm
  const confirm = last.current
  const close = (open: boolean) => !open && actions.setConfirm(null)

  return (
    <>
      <ConfirmDialog
        open={open === 'remove'}
        onOpenChange={close}
        title={confirm?.kind === 'remove' ? `Remove ${confirm.row.name}?` : ''}
        confirmLabel={confirm?.kind === 'remove' ? `Remove ${confirm.row.name}` : 'Remove'}
        cancelLabel="Keep access"
        destructive
        pending={actions.remove.isPending}
        onConfirm={() => confirm?.kind === 'remove' && actions.remove.mutate(confirm.row)}
      >
        They lose access to {organization} immediately and are signed out there. Everything they did
        stays in the audit trail under their name. You can invite them again later.
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'reset'}
        onOpenChange={close}
        title={confirm?.kind === 'reset' ? `Reset ${confirm.row.name}'s two-step?` : ''}
        confirmLabel="Reset two-step"
        destructive
        pending={actions.resetTwoStep.isPending}
        onConfirm={() => confirm?.kind === 'reset' && actions.resetTwoStep.mutate(confirm.row)}
      >
        Use this when they've lost their phone and backup codes. They'll be signed out everywhere
        and must set a new password from the link we email them, then set up two-step again. This
        applies in every organization they belong to.
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'owner'}
        onOpenChange={close}
        title={confirm?.kind === 'owner' ? `Make ${confirm.row.name} an owner?` : ''}
        confirmLabel="Make owner"
        onConfirm={() => confirm?.kind === 'owner' && actions.makeOwner(confirm)}
      >
        Owners can do everything in {organization}, including changing who has access and removing
        other owners.
      </ConfirmDialog>
    </>
  )
}
