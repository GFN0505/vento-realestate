import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { NotFound, RouteError } from '@/components/route-error'
import { Toaster } from '@/components/ui/sonner'
import { useSessionExpired } from '@/lib/session-expired'
import type { RouterContext } from '@/router'

// Rarely needed, so its dialog and code input only load when a session actually ends.
const SessionExpiredDialog = lazy(() =>
  import('@/components/session-expired-dialog').then((m) => ({ default: m.SessionExpiredDialog })),
)

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
})

function RootLayout() {
  const sessionEnded = useSessionExpired()
  return (
    <>
      <Outlet />
      {sessionEnded && (
        <Suspense>
          <SessionExpiredDialog />
        </Suspense>
      )}
      <Toaster position="top-center" />
    </>
  )
}
