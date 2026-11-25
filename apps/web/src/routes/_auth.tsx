import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { meQuery } from '@/features/account/api'

export const Route = createFileRoute('/_auth')({
  // Someone already signed in and set up doesn't need the sign-in screens. Anyone else (or a
  // failed check, e.g. the API is down) sees the page. Invitations can be opened when signed in.
  beforeLoad: async ({ context, location }) => {
    if (location.pathname.startsWith('/accept-invitation')) return
    const me = await context.queryClient.fetchQuery(meQuery()).catch(() => null)
    if (me?.nextStep === 'ready') throw redirect({ to: '/' })
  },
  component: Outlet,
})
