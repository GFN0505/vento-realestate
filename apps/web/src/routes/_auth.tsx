import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { meQuery } from '@/features/account/api'

/** Opened while signed in too: customer invitations and the staff sign-up check the email. */
const OPEN_WHEN_SIGNED_IN = ['/accept-invitation', '/staff-invitation']

export const Route = createFileRoute('/_auth')({
  // Someone already signed in and set up doesn't need the sign-in screens: customers go to their
  // workspace, Vento Real Estate staff to the console. Anyone else (or a failed check, e.g. the
  // API is down) sees the page.
  beforeLoad: async ({ context, location }) => {
    if (OPEN_WHEN_SIGNED_IN.some((path) => location.pathname.startsWith(path))) return
    const me = await context.queryClient.fetchQuery(meQuery()).catch(() => null)
    if (me?.nextStep === 'ready') throw redirect({ to: '/' })
    if (me?.nextStep === 'console') throw redirect({ to: '/console' })
  },
  component: Outlet,
})
