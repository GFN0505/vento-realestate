import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/auth-layout'
import { resetForNewSession } from '@/features/account/api'
import { PasswordStep } from '@/features/auth/password-step'
import { TwoStepCheck } from '@/features/auth/two-step-check'
import { readRememberedEmail, rememberEmail } from '@/lib/remembered-email'
import { safeRedirect } from '@/lib/safe-redirect'

type Search = { redirect?: string; email?: string }

export const Route = createFileRoute('/_auth/sign-in')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
  }),
  component: SignInPage,
})

function SignInPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // The two-step check is a step inside this page, tied to a short-lived cookie, not a URL.
  const [twoStepFor, setTwoStepFor] = useState<string | null>(null)
  // A link's ?email= wins over the one remembered on this device.
  const [remembered] = useState(() => (search.email ? undefined : readRememberedEmail()))
  const [lastEmail, setLastEmail] = useState(search.email ?? remembered)
  const [keepSignedIn, setKeepSignedIn] = useState(false)

  function finish(email = lastEmail, keep = keepSignedIn) {
    if (email) rememberEmail(email, keep)
    resetForNewSession(queryClient)
    void navigate({ href: safeRedirect(search.redirect), replace: true })
  }

  return (
    <AuthLayout
      back={
        twoStepFor ? { label: 'Back to sign in', onClick: () => setTwoStepFor(null) } : undefined
      }
    >
      {twoStepFor ? (
        <TwoStepCheck
          email={twoStepFor}
          onSignedIn={() => finish()}
          onBack={() => setTwoStepFor(null)}
          onRestart={(message) => {
            setTwoStepFor(null)
            toast.error(message)
          }}
        />
      ) : (
        <PasswordStep
          defaultEmail={lastEmail}
          remembered={!!remembered && lastEmail === remembered}
          onResult={(result, email, keep) => {
            setLastEmail(email)
            setKeepSignedIn(keep)
            if (result.status === 'two-step') return setTwoStepFor(email)
            if (result.status === 'unverified') {
              return void navigate({ to: '/verify-email', search: { email } })
            }
            finish(email, keep)
          }}
        />
      )}
    </AuthLayout>
  )
}
