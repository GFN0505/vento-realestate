import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { clearPreview, startPreview } from '@/features/preview/preview-role'
import { useMe } from '@/features/preview/use-effective-permissions'
import { toastApiError } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'

/** Actions the user menu, the More sheet and ⌘K share, so each behaves the same everywhere. */
export function useShellActions() {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const signOutEverywhereElse = useMutation(
    orpc.account.sessions.revokeOthers.mutationOptions({
      onSuccess: ({ notice }) => toast.success(notice),
      onError: toastApiError,
    }),
  )

  return {
    async signOut() {
      // The Better Auth client loads only when someone signs out.
      const { signOut } = await import('@/features/account/sign-out')
      await signOut(queryClient)
      toast.success('Signed out')
      void navigate({ to: '/sign-in', replace: true })
    },
    signOutEverywhereElse: () => signOutEverywhereElse.mutate({}),
    preview(roleId: string) {
      if (!me.organization) return
      startPreview(me.organization.id, roleId)
      void navigate({ to: '/' })
    },
    stopPreview: clearPreview,
  }
}
