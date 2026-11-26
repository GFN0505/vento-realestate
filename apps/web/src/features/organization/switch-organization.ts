import { useMutation } from '@tanstack/react-query'
import { NEXT_STEP_PATH } from '@/features/account/api'
import { clearPreview } from '@/features/preview/preview-role'
import { useMe } from '@/features/preview/use-effective-permissions'
import { toastApiError } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'
import { reloadIntoOrganization, setSwitchingOrganization } from '@/lib/tab-organization'

/**
 * Switch organization (2 clicks). The server checks membership and moves the session; this tab
 * then reloads into the new organization's Home (or two-step setup first), with a toast.
 */
export function useSwitchOrganization() {
  const me = useMe()
  return useMutation(
    orpc.account.switchOrganization.mutationOptions({
      onMutate: () => setSwitchingOrganization(true),
      onSuccess: ({ organization, nextStep }) => {
        clearPreview()
        const path = nextStep === 'ready' ? '/' : NEXT_STEP_PATH[nextStep]
        reloadIntoOrganization(organization, path, me.user.id)
      },
      onError: (error) => {
        setSwitchingOrganization(false)
        toastApiError(error)
      },
    }),
  )
}
