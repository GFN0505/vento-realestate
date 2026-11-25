import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { meQuery } from '@/features/account/api'
import { RequestLinkForm } from '@/features/auth/request-link-form'
import { VerifyEmailPanel } from '@/features/auth/verify-email-panel'
import { authClient } from '@/lib/auth-client'

type Search = { email?: string; error?: string }

export const Route = createFileRoute('/_auth/verify-email')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    email: typeof search.email === 'string' ? search.email : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  // The link in the email lands here signed in; carry on into the app.
  beforeLoad: async ({ context, search }) => {
    if (search.error || search.email) return
    const me = await context.queryClient.fetchQuery(meQuery()).catch(() => null)
    if (me) throw redirect({ to: '/' })
  },
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { email, error } = Route.useSearch()
  const navigate = useNavigate()
  if (email && !error) {
    return (
      <AuthLayout>
        <VerifyEmailPanel email={email} />
      </AuthLayout>
    )
  }
  return (
    <AuthLayout>
      <AuthHeader title={error ? 'This link has expired' : 'Verify your email'}>
        Enter your work email and we'll send a new link and code.
      </AuthHeader>
      <RequestLinkForm
        defaultEmail={email}
        submitLabel="Send a new link"
        pendingLabel="Sending…"
        send={(to) => authClient.sendVerificationEmail({ email: to, callbackURL: '/verify-email' })}
        onSent={(to) => void navigate({ to: '/verify-email', search: { email: to } })}
      />
    </AuthLayout>
  )
}
