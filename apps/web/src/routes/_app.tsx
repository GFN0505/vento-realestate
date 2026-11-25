import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { isUnauthorized, meQuery, NEXT_STEP_PATH } from '@/features/account/api'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery()).catch((error: unknown) => {
      if (isUnauthorized(error)) {
        throw redirect({ to: '/sign-in', search: { redirect: location.href } })
      }
      throw error
    })
    // The server decides the next step; the app only follows it.
    const required = me.nextStep === 'ready' ? null : NEXT_STEP_PATH[me.nextStep]
    if (required && location.pathname !== required) throw redirect({ href: required })
    if (!required && location.pathname in SETUP_PATHS) throw redirect({ to: '/' })
    return { me }
  },
  component: Outlet,
})

const SETUP_PATHS = { '/onboarding': true, '/two-step/setup': true }
