import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { InvitationPreview, Me } from '@vento/shared'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/account/sign-out'
import { apiErrorMessage } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'

type Props = { token: string; preview: InvitationPreview; me: Me; onAccepted: () => void }

/** Already signed in: accept with this account, or sign out if it's someone else's invitation. */
export function AcceptSignedIn({ token, preview, me, onAccepted }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const accept = useMutation(orpc.invitations.accept.mutationOptions({ onSuccess: onAccepted }))

  if (me.user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <>
        <FormAlert variant="info" title={`This invitation is for ${preview.email}.`}>
          You're signed in as {me.user.email}.
        </FormAlert>
        <Button
          size="lg"
          className="w-full"
          onClick={async () => {
            await signOut(queryClient)
            await router.invalidate()
          }}
        >
          Sign out and continue
        </Button>
      </>
    )
  }

  const needsSetup = preview.twoStepRequired && !me.user.twoFactorEnabled
  return (
    <>
      {accept.error && <FormAlert variant="error">{apiErrorMessage(accept.error)}</FormAlert>}
      <Button
        size="lg"
        className="w-full"
        disabled={accept.isPending}
        onClick={() => accept.mutate({ token })}
      >
        {accept.isPending
          ? 'Joining…'
          : needsSetup
            ? 'Accept and set up two-step'
            : 'Accept invitation'}
      </Button>
    </>
  )
}
