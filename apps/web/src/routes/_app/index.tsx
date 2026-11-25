import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { meQuery } from '@/features/account/api'
import { signOut } from '@/features/account/sign-out'
import { toastApiError } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'

export const Route = createFileRoute('/_app/')({
  component: SignedInPage,
})

/** Temporary page until the app shell arrives in brick 3 (not in SCREENS.md). */
function SignedInPage() {
  const { me: initial } = Route.useRouteContext()
  const { data: me = initial } = useQuery(meQuery())
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function leave() {
    await signOut(queryClient)
    void navigate({ to: '/sign-in', replace: true })
  }

  const everywhere = useMutation(
    orpc.account.sessions.revokeOthers.mutationOptions({
      onSuccess: async ({ notice }) => {
        toast.success(notice)
        await leave()
      },
      onError: toastApiError,
    }),
  )

  return (
    <AuthLayout>
      <AuthHeader title={`Welcome, ${me.user.name.split(' ')[0]}`}>
        You're signed in to {me.organization?.name ?? 'Vento'}
        {me.member ? ` as ${me.member.role.name}` : ''}.
      </AuthHeader>
      <p className="text-muted-foreground text-sm">Your workspace arrives in the next release.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" variant="outline" className="sm:flex-1" onClick={() => void leave()}>
          Sign out
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="sm:flex-1"
          disabled={everywhere.isPending}
          onClick={() => everywhere.mutate({})}
        >
          Sign out everywhere
        </Button>
      </div>
    </AuthLayout>
  )
}
