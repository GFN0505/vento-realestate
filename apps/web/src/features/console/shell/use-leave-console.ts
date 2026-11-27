import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { consoleGate } from '../gate/console-gate'

/** Sign out from the console: the session ends and every cached answer is dropped. */
export function useLeaveConsole() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return {
    async signOut() {
      const { signOut } = await import('@/features/account/sign-out')
      await signOut(queryClient)
      consoleGate.reset()
      toast.success('Signed out')
      void navigate({ to: '/sign-in', replace: true })
    },
  }
}
