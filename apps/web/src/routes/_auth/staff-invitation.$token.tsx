import { ORPCError } from '@orpc/client'
import { createFileRoute } from '@tanstack/react-router'
import type { StaffJoinPreview } from '@vento/shared/console'
import { meQuery } from '@/features/account/api'
import { joinClient } from '@/features/console/join/join-client'
import { JoinLoadError } from '@/features/console/join/join-load-error'
import { StaffSignUpPage } from '@/features/console/join/staff-sign-up-page'

/**
 * The staff sign-up (spec 1b §1): public, outside /console so it's never a 404. The loader stays
 * with the component, so the console's client and contract never reach the main chunk.
 */
const UNKNOWN_LINK: StaffJoinPreview = {
  status: 'expired',
  email: null,
  name: null,
  inviterName: null,
  expiresAt: null,
  resume: false,
}

export const Route = createFileRoute('/_auth/staff-invitation/$token')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  loader: async ({ context, params }) => {
    const [preview, me] = await Promise.all([
      joinClient.console.join.get({ token: params.token }).catch((error: unknown) => {
        // A mangled link reads like an unknown one: expired, with nothing else (spec).
        if (error instanceof ORPCError && ['NOT_FOUND', 'BAD_REQUEST'].includes(error.code)) {
          return UNKNOWN_LINK
        }
        throw error
      }),
      context.queryClient.fetchQuery(meQuery()).catch(() => null),
    ])
    return { preview, me }
  },
  component: StaffInvitationRoute,
  errorComponent: JoinLoadError,
})

function StaffInvitationRoute() {
  const { token } = Route.useParams()
  const { preview, me } = Route.useLoaderData()
  return <StaffSignUpPage token={token} preview={preview} me={me} />
}
