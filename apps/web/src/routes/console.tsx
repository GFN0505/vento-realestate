import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router'
import { meQuery } from '@/features/account/api'
import { ConsoleLayout } from '@/features/console/shell/console-layout'
import { ConsoleNotFound } from '@/features/console/shell/console-not-found'
import { ConsoleRouteError } from '@/features/console/shell/console-route-error'

/*
 * The Vento console (decision 0021): at the root, not under `_app`, because it has no
 * organization, no tab binding and no next-step redirects. Only `beforeLoad` stays in the main
 * chunk, and it imports nothing but `meQuery`: everyone who isn't an active super-admin gets the
 * standalone 404 and never downloads console code (the components below are split off).
 */
export const Route = createFileRoute('/console')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient
      .ensureQueryData({ ...meQuery(), revalidateIfStale: true })
      .catch(() => null)
    if (!me?.console) throw notFound({ routeId: rootRouteId })
    return { me }
  },
  component: ConsoleLayout,
  errorComponent: ConsoleRouteError,
  notFoundComponent: ConsoleNotFound,
})
