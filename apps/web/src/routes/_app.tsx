import { createFileRoute, notFound, Outlet, redirect, rootRouteId } from '@tanstack/react-router'
import { isUnauthorized, meQuery, NEXT_STEP_PATH } from '@/features/account/api'
import { clearPreview, getPreview } from '@/features/preview/preview-role'
import { canPreview, rolesQuery } from '@/features/preview/use-effective-permissions'
import { NAV_PATHS } from '@/features/shell/nav-paths'
import { syncTabOrganization } from '@/lib/tab-organization'

const SETUP_PATHS: Record<string, true> = { '/onboarding': true, '/two-step/setup': true }

/** Addresses the app knows. A signed-out visitor to anything else gets the standalone 404. */
function isKnownPath(pathname: string): boolean {
  if (pathname in SETUP_PATHS) return true
  return NAV_PATHS.some((to) =>
    to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`),
  )
}

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient
      .ensureQueryData({ ...meQuery(), revalidateIfStale: true })
      .catch((error: unknown) => {
        if (isUnauthorized(error)) {
          if (!isKnownPath(location.pathname)) throw notFound({ routeId: rootRouteId })
          throw redirect({ to: '/sign-in', search: { redirect: location.href } })
        }
        throw error
      })
    // Decision 0013: bind this tab to the session's organization, or reload if it moved.
    syncTabOrganization(me)
    // The server decides the next step; the app only follows it.
    const required = me.nextStep === 'ready' ? null : NEXT_STEP_PATH[me.nextStep]
    if (required && location.pathname !== required) throw redirect({ href: required })
    if (!required && location.pathname in SETUP_PATHS) throw redirect({ to: '/' })
    // A preview survives a reload: load its role first, so the admin's own nav never flashes.
    if (getPreview(me.organization?.id)) {
      if (!canPreview(me)) clearPreview()
      else await context.queryClient.ensureQueryData(rolesQuery()).catch(() => clearPreview())
    }
    return { me }
  },
  component: Outlet,
})
