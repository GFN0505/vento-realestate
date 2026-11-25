import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthFootnote, AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { RequestLinkForm } from '@/features/auth/request-link-form'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
})

/** Board ForgotPassword. The reply never says whether an account exists. */
function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  return (
    <AuthLayout>
      <AuthHeader title="Reset your password">
        Enter your work email and we'll send a reset link.
      </AuthHeader>
      <RequestLinkForm
        submitLabel={sentTo ? 'Send again' : 'Send reset link'}
        pendingLabel="Sending…"
        send={(email) => authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })}
        onSent={setSentTo}
      />
      {sentTo && (
        <FormAlert variant="success" title="Check your email.">
          If an account exists for {sentTo}, a link is on its way. It expires in 30 minutes.
        </FormAlert>
      )}
      <AuthFootnote>
        <Link to="/sign-in">Back to sign in</Link>
      </AuthFootnote>
    </AuthLayout>
  )
}
