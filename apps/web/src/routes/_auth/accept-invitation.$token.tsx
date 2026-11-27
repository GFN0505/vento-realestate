import { ORPCError } from '@orpc/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AuthFootnote, AuthLayout, LEGAL_LINKS } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { meQuery, resetForNewSession } from '@/features/account/api'
import { AcceptAsNewUser } from '@/features/invitations/accept-as-new-user'
import { AcceptSignedIn } from '@/features/invitations/accept-signed-in'
import { InvitationClosed } from '@/features/invitations/invitation-closed'
import { InvitationSummary } from '@/features/invitations/invitation-summary'
import { toastApiError } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'
import { forgetTabOrganization } from '@/lib/tab-organization'

export const Route = createFileRoute('/_auth/accept-invitation/$token')({
  loader: async ({ context, params }) => {
    const [preview, me] = await Promise.all([
      context.queryClient
        .fetchQuery(orpc.invitations.preview.queryOptions({ input: { token: params.token } }))
        .catch((error: unknown) => {
          // A mangled or truncated link is "doesn't work", same as an unknown one. Only a
          // failed connection reaches the "Couldn't reach Vento" screen.
          if (error instanceof ORPCError && ['NOT_FOUND', 'BAD_REQUEST'].includes(error.code)) {
            return null
          }
          throw error
        }),
      context.queryClient.fetchQuery(meQuery()).catch(() => null),
    ])
    return { preview, me }
  },
  component: AcceptInvitationPage,
})

function AcceptInvitationPage() {
  const { token } = Route.useParams()
  const { preview, me } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const decline = useMutation(
    orpc.invitations.decline.mutationOptions({
      onSuccess: ({ notice }) => {
        toast.success(notice)
        void router.invalidate()
      },
      onError: toastApiError,
    }),
  )

  function accepted() {
    // Accepting moves an existing user into the new organization (decision 10). Forget what
    // this tab was showing so the guard binds it afresh from `me`, with no "switched" notice.
    // The app's guard sends them to two-step setup first when the role needs it.
    forgetTabOrganization()
    resetForNewSession(queryClient)
    void navigate({ to: '/', replace: true })
  }

  if (preview?.status !== 'pending') {
    return (
      <AuthLayout>
        <InvitationClosed preview={preview} />
      </AuthLayout>
    )
  }

  const signInHere = `/accept-invitation/${token}`
  return (
    <AuthLayout>
      <InvitationSummary preview={preview} />
      {preview.staffAccount ? (
        // Decision 0023: a staff email can't join any organization; say so before anything.
        <FormAlert variant="error">
          This email belongs to a Vento Real Estate staff account, so it can't join{' '}
          {preview.organizationName}. Ask {preview.inviterName} to invite a different email.
        </FormAlert>
      ) : me ? (
        <AcceptSignedIn token={token} preview={preview} me={me} onAccepted={accepted} />
      ) : preview.hasAccount ? (
        <>
          <FormAlert variant="info" title="You already use Vento.">
            Sign in as {preview.email} to accept.
          </FormAlert>
          <Button size="lg" className="w-full" asChild>
            <Link to="/sign-in" search={{ email: preview.email, redirect: signInHere }}>
              Sign in to accept
            </Link>
          </Button>
        </>
      ) : (
        <AcceptAsNewUser
          token={token}
          preview={preview}
          onAccepted={accepted}
          onSignInNeeded={() => void navigate({ to: '/sign-in', search: { email: preview.email } })}
          onHasAccount={() =>
            void navigate({
              to: '/sign-in',
              search: { email: preview.email, redirect: signInHere },
            })
          }
        />
      )}
      <AuthFootnote>
        Not you, or not expecting this?{' '}
        <button
          type="button"
          disabled={decline.isPending}
          onClick={() => decline.mutate({ token })}
        >
          Decline invitation
        </button>
        .
        {!me && !preview.hasAccount && !preview.staffAccount && (
          <>
            {' '}
            By accepting, you agree to the <a href={LEGAL_LINKS.terms}>Terms</a> and{' '}
            <a href={LEGAL_LINKS.privacy}>Privacy notice</a>.
          </>
        )}
      </AuthFootnote>
    </AuthLayout>
  )
}
