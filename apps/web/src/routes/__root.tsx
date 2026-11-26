import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { LazyStandaloneNotFound } from '@/components/errors/lazy-pages'
import { ShellRouteError } from '@/components/errors/shell-route-error'
import { Toaster } from '@/components/ui/sonner'
import { useSessionExpired } from '@/lib/session-expired'
import type { RouterContext } from '@/router'

// Rarely needed, so its dialog and code input only load when a session actually ends.
const SessionExpiredDialog = lazy(() =>
  import('@/components/session-expired-dialog').then((m) => ({ default: m.SessionExpiredDialog })),
)

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  // Outside the shell (signed out, or the shell itself couldn't load): standalone pages.
  errorComponent: ShellRouteError,
  notFoundComponent: LazyStandaloneNotFound,
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
