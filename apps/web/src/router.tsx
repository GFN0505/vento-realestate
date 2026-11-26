import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import type { PermissionModule } from '@vento/shared'
import { ShellRouteError } from '@/components/errors/shell-route-error'
import { PageSkeleton } from '@/components/shell/page-skeleton'
import { routeTree } from './routeTree.gen'

export type RouterContext = { queryClient: QueryClient }

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    // Start loading a page's code and data when the user hovers or touches its link.
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Window scroll (fixed sidebar), so back and forward restore the position.
    scrollRestoration: true,
    // Every route's boundary: 403, 404, 500 or offline, inside the shell when there is one.
    defaultErrorComponent: ShellRouteError,
    defaultPendingComponent: PageSkeleton,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
  interface StaticDataRouteOption {
    /** The module a route belongs to: the shell re-checks view access against it live. */
    module?: PermissionModule
    /**
     * Organization-wide pages (e.g. an organization or plan settings section): the top bar hides
     * the entity switcher there, because the page doesn't follow it.
     */
    orgWide?: boolean
  }
}
