import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { BackupCodes } from '@/components/auth/backup-codes'
import { Button } from '@/components/ui/button'
import { meQuery } from '@/features/account/api'
import { TwoStepSetupSteps } from '@/features/two-step/two-step-setup'
import { useTwoStepSetup } from '@/features/two-step/use-two-step-setup'
import { orpc } from '@/lib/orpc'

export const Route = createFileRoute('/_app/two-step/setup')({
  component: TwoStepSetupPage,
})

/** The two-step panel of SecuritySettings, inside the sign-in layout (pattern). */
function TwoStepSetupPage() {
  const { me: initial } = Route.useRouteContext()
  const { data: me = initial } = useQuery(meQuery())
  const setup = useTwoStepSetup()
  const [saved, setSaved] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // The setup screen keeps a way out (spec): someone on a shared PC, or not ready, signs out.
  async function leave() {
    const { signOut } = await import('@/features/account/sign-out')
    await signOut(queryClient)
    void navigate({ to: '/sign-in', replace: true })
  }

  async function finish() {
    toast.success('Two-step is on')
    await queryClient.invalidateQueries({ queryKey: orpc.account.me.key() })
    void navigate({ to: '/', replace: true })
  }

  if (setup.stage.name === 'codes') {
    return (
      <AuthLayout>
        <AuthHeader title="Two-step is on" />
        <BackupCodes
          codes={setup.stage.backupCodes}
          email={me.user.email}
          saved={saved}
          onSavedChange={setSaved}
        />
        <Button size="lg" className="w-full" disabled={!saved} onClick={() => void finish()}>
          Continue
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout wide>
      <AuthHeader title="Set up two-step sign-in">
        {me.twoStepRequiredBy?.reason === 'super_admin'
          ? 'Staff accounts need it every time you sign in. It takes about a minute.'
          : me.twoStepRequiredBy?.reason === 'organization'
            ? `${me.twoStepRequiredBy.organizationName} requires a code from an authenticator app each time you sign in. It takes about a minute.`
            : me.twoStepRequired
              ? 'Your role needs a code from an authenticator app each time you sign in. It takes about a minute.'
              : 'Add a code from an authenticator app to each sign-in.'}
      </AuthHeader>
      <TwoStepSetupSteps setup={setup} />
      <Button variant="ghost" className="mx-auto mt-2 min-h-11" onClick={() => void leave()}>
        Sign out
      </Button>
    </AuthLayout>
  )
}
