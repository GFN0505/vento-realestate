import { useRef } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useMe } from '@/features/preview/use-effective-permissions'
import { OwnerConfirm } from './owner-confirm'
import { ResendOwnerSheet } from './resend-owner-sheet'
import { useTeamActionsContext } from './use-team-actions'

/** The three confirms (spec UI copy): remove, reset two-step and make owner (or its request). */
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
        pending={actions.resetTwoStep.isPending}
        onConfirm={() => confirm?.kind === 'reset' && actions.resetTwoStep.mutate(confirm.row)}
      >
        {confirm?.kind === 'reset' && resetConsequences(confirm.row.passkeyCount)}
      </ConfirmDialog>
      <OwnerConfirm
        confirm={confirm?.kind === 'owner' ? confirm : null}
        open={open === 'owner'}
        organization={organization}
        onClose={() => actions.setConfirm(null)}
        openRequest={actions.openRequest}
      />
      <ResendOwnerSheet
        confirm={confirm?.kind === 'resend-owner' ? confirm : null}
        open={open === 'resend-owner'}
        onClose={() => actions.setConfirm(null)}
        openRequest={actions.openRequest}
      />
    </>
  )
}

/** The reset confirm's body (spec 3d): the passkeys go too, so a lost phone can't sign in. */
export function resetConsequences(passkeys: number): string {
  const signedOut =
    passkeys > 0
      ? `They'll be signed out everywhere, their ${passkeys} ${passkeys === 1 ? 'passkey' : 'passkeys'} will be removed, and they must`
      : "They'll be signed out everywhere and must"
  return `Use this when they've lost their phone and backup codes. ${signedOut} set a new password from the link we email them, then set up two-step again. This applies in every organization they belong to.`
}
