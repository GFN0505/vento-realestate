import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { consoleKey } from '../api'
import { consoleGate } from '../gate/console-gate'

/** Back to the customer workspace, or sign out. Either way the console's data is dropped. */
export function useLeaveConsole() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return {
    back() {
      queryClient.removeQueries({ queryKey: consoleKey() })
      consoleGate.reset()
      void navigate({ to: '/' })
    },
    async signOut() {
      const { signOut } = await import('@/features/account/sign-out')
      await signOut(queryClient)
      consoleGate.reset()
      toast.success('Signed out')
      void navigate({ to: '/sign-in', replace: true })
    },
  }
}
