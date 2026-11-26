import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { orpc } from '@/lib/orpc'
import { type SecurityDialog, securityUi } from '../security-dialogs'
import { sessionsQuery } from '../security-queries'
import { devicesWords } from '../security-words'

type Props = { dialog: Extract<SecurityDialog, { name: 'sign-out-others' }> | null }

/** "Sign out 2 other devices?" (spec): every other session, in every organization. */
export function SignOutOthersDialog({ dialog }: Props) {
  const queryClient = useQueryClient()
  const count = dialog?.count ?? 0
  const signOut = useMutation(
    orpc.account.sessions.revokeOthers.mutationOptions({
      onSuccess: ({ notice }) => {
        toast.success(notice)
        securityUi.close()
      },
      onError: (error) => {
        toastApiError(error)
        securityUi.close()
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: sessionsQuery().queryKey }),
    }),
  )

  return (
    <ConfirmDialog
      open={dialog !== null}
      onOpenChange={(open) => !open && securityUi.close()}
      title={`Sign out ${count} other ${count === 1 ? 'device' : 'devices'}?`}
      confirmLabel={`Sign out ${devicesWords(count)}`}
      destructive
      pending={signOut.isPending}
      onConfirm={() => {
        if (!connection.isOnline()) return void toast.error(OFFLINE_SAVE_ERROR)
        signOut.mutate({})
      }}
    >
      They'll need your password and two-step code, or a passkey, to sign in again. This includes
      devices signed in to your other organizations.
    </ConfirmDialog>
  )
}
