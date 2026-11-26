import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { LazyStandaloneNotFound } from '@/components/errors/lazy-pages'
import { ShellRouteError } from '@/components/errors/shell-route-error'
import { useSessionExpired } from '@/lib/session-expired'
import type { RouterContext } from '@/router'

// Rarely needed, so its dialog and code input only load when a session actually ends.
const SessionExpiredDialog = lazy(() =>
  import('@/components/session-expired-dialog').then((m) => ({ default: m.SessionExpiredDialog })),
)

// Mounted once the page is idle. Sonner replays toasts raised before it subscribes, so a toast
// from a guard or the first render is shown, not lost.
const Toaster = lazy(() => import('@/components/ui/sonner').then((m) => ({ default: m.Toaster })))

function useIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const request = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200))
    request(() => setIdle(true), { timeout: 1500 })
  }, [])
  return idle
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  // Outside the shell (signed out, or the shell itself couldn't load): standalone pages.
  errorComponent: ShellRouteError,
  notFoundComponent: LazyStandaloneNotFound,
})

function RootLayout() {
  const sessionEnded = useSessionExpired()
  const idle = useIdle()
  return (
    <>
      <Outlet />
      {sessionEnded && (
        <Suspense>
          <SessionExpiredDialog />
        </Suspense>
      )}
      {idle && (
        <Suspense>
          <Toaster position="top-center" />
        </Suspense>
      )}
    </>
  )
}
