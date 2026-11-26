import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'

/**
 * Someone removed from their only organization: "You no longer have access to Vento Homes Ltd."
 * with Sign out, or start their own organization instead.
 */
export function AccessEnded({ message, onContinue }: { message: string; onContinue: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  async function leave() {
    const { signOut } = await import('@/features/account/sign-out')
    await signOut(queryClient)
    void navigate({ to: '/sign-in', replace: true })
  }
  return (
    <AuthLayout>
      <AuthHeader title={message}>
        Ask an owner or admin there if you think this is a mistake.
      </AuthHeader>
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={() => void leave()}>
          Sign out
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={onContinue}>
          Set up a new organization
        </Button>
      </div>
    </AuthLayout>
  )
}
