import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/auth-layout'
import { resetForNewSession } from '@/features/account/api'
import { PasswordStep } from '@/features/auth/password-step'
import { TwoStepCheck } from '@/features/auth/two-step-check'
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
  const [lastEmail, setLastEmail] = useState(search.email)

  function finish() {
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
          onSignedIn={finish}
          onRestart={(message) => {
            setTwoStepFor(null)
            toast.error(message)
          }}
        />
      ) : (
        <PasswordStep
          defaultEmail={lastEmail}
          onResult={(result, email) => {
            setLastEmail(email)
            if (result.status === 'two-step') return setTwoStepFor(email)
            if (result.status === 'unverified') {
              return void navigate({ to: '/verify-email', search: { email } })
            }
            finish()
          }}
        />
      )}
    </AuthLayout>
  )
}
