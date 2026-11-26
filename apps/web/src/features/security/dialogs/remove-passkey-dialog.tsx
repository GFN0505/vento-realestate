import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { securityQuery } from '@/features/settings/security-queries'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { orpc } from '@/lib/orpc'
import { type SecurityDialog, securityUi } from '../security-dialogs'

type Props = { dialog: Extract<SecurityDialog, { name: 'remove-passkey' }> | null }

/** "Remove iCloud Keychain · iPhone?" (spec): it stops working at once; sessions carry on. */
export function RemovePasskeyDialog({ dialog }: Props) {
  const queryClient = useQueryClient()
  const remove = useMutation(
    orpc.account.passkeys.remove.mutationOptions({
      onSuccess: ({ notice }) => {
        toast.success(notice)
        securityUi.close()
      },
      onError: (error) => {
        toastApiError(error)
        securityUi.close()
      },
      // Removed, or already gone: either way the list shows what's true now.
      onSettled: () => queryClient.invalidateQueries({ queryKey: securityQuery().queryKey }),
    }),
  )
  const name = dialog?.passkey.name ?? ''

  return (
    <ConfirmDialog
      open={dialog !== null}
      onOpenChange={(open) => !open && securityUi.close()}
      title={`Remove ${name}?`}
      confirmLabel="Remove passkey"
      destructive
      pending={remove.isPending}
      onConfirm={() => {
        if (!dialog) return
        if (!connection.isOnline()) return void toast.error(OFFLINE_SAVE_ERROR)
        remove.mutate({ id: dialog.passkey.id })
      }}
    >
      You won't be able to sign in with it. Devices already signed in stay signed in; sign them out
      below if you need to.
    </ConfirmDialog>
  )
}
