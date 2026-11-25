import { ORPCError } from '@orpc/client'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthFootnote, AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { ResetPasswordForm } from '@/features/auth/reset-password-form'
import { client } from '@/lib/orpc'

type Search = { token?: string; error?: string }

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token, error: search.error }),
  // A used, expired or mangled link reads as "expired"; it never says why.
  loader: async ({ deps }) => {
    if (!deps.token || deps.error) return { email: null }
    try {
      const info = await client.account.passwordResetInfo({ token: deps.token })
      return { email: info.email }
    } catch (error) {
      // Only "not found" means a bad link; a dropped connection shows the retry screen.
      if (error instanceof ORPCError && error.code === 'NOT_FOUND') return { email: null }
      throw error
    }
  },
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  const { email } = Route.useLoaderData()
  if (!token || !email) {
    return (
      <AuthLayout>
        <AuthHeader title="This link has expired">
          Reset links work once and for 30 minutes. Ask for a new one.
        </AuthHeader>
        <Button size="lg" className="w-full" asChild>
          <Link to="/forgot-password">Send a new link</Link>
        </Button>
        <AuthFootnote>
          <Link to="/sign-in">Back to sign in</Link>
        </AuthFootnote>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout>
      <AuthHeader title="Choose a new password">For {email}</AuthHeader>
      <ResetPasswordForm token={token} email={email} />
    </AuthLayout>
  )
}
