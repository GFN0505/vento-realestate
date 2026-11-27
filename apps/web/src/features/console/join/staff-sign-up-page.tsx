import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import type { Me } from '@vento/shared'
import type { StaffJoinPreview } from '@vento/shared/console'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { PendingLabel } from '@/components/ui/pending-label'
import { meQuery } from '@/features/account/api'
import { JoinClosed } from './join-closed'
import { JoinForm } from './join-form'
import { JoinPasskey } from './join-passkey'
import { JoinTwoStep } from './join-two-step'
import { welcome } from './join-words'
import { useStaffJoin } from './use-staff-join'

type Props = { token: string; preview: StaffJoinPreview; me: Me | null }

/**
 * The staff sign-up (spec 1b §1, `/staff-invitation/{token}`): separate from customer sign-up.
 * Name and password → two-step → backup codes → an optional passkey → the console's Dashboard.
 */
export function StaffSignUpPage({ token, preview, me }: Props) {
  useEffect(() => {
    document.title = 'Join the console · Vento Real Estate'
  }, [])
  const otherPerson =
    me && preview.email && me.user.email.toLowerCase() !== preview.email.toLowerCase()
  return (
    <AuthLayout wide>
      {preview.status !== 'pending' ? (
        <JoinClosed preview={preview} />
      ) : otherPerson ? (
        <SignedInAsOther email={me.user.email} />
      ) : (
        <JoinSteps token={token} preview={preview} />
      )}
    </AuthLayout>
  )
}

function JoinSteps({ token, preview }: { token: string; preview: StaffJoinPreview }) {
  const flow = useStaffJoin(token, preview.email)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setStep } = flow
  const finish = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: meQuery().queryKey }).then(() => {
      toast.success(welcome(preview.name))
      void navigate({ to: '/console', replace: true })
    })
  }, [queryClient, navigate, preview.name])
  const toPasskey = useCallback(() => setStep('passkey'), [setStep])

  if (flow.step === 'account') return <JoinForm preview={preview} join={flow.join} />
  if (flow.step === 'passkey') return <JoinPasskey onDone={finish} />
  return <JoinTwoStep password={flow.password} email={preview.email ?? ''} onDone={toPasskey} />
}

/** Spec: "You're signed in as olumide@ventohomes.ng. Sign out to accept this staff invitation." */
function SignedInAsOther({ email }: { email: string }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  async function signOutAndContinue() {
    setPending(true)
    const { signOut } = await import('@/features/account/sign-out')
    await signOut(queryClient)
    setPending(false)
    void router.invalidate()
  }
  return (
    <>
      <AuthHeader title="Join the Vento Real Estate console">
        You're signed in as {email}. Sign out to accept this staff invitation.
      </AuthHeader>
      <Button
        size="lg"
        className="relative w-full"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => void signOutAndContinue()}
      >
        <PendingLabel pending={pending}>Sign out and continue</PendingLabel>
      </Button>
    </>
  )
}
