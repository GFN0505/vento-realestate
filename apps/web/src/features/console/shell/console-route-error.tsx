import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { LazyServerErrorPage } from '@/components/errors/lazy-pages'
import { OfflinePage } from '@/components/errors/offline-page'
import { chunkFailureAction, lastChunkReloadAt, reloadForNewVersion } from '@/lib/chunk-errors'
import { connection } from '@/lib/connection'
import { errorReference, isChunkLoadFailure, isNetworkFailure, isNotFound } from '@/lib/error-data'
import { ConsoleNotFoundPage } from './console-not-found'
import { ConsoleShell } from './console-shell'

/**
 * A console page's error boundary: 404, offline or 500 in the page area, never the customer
 * pages (no "Go to home", no ⌘K). "Try again" reloads the route's data.
 */
export function ConsolePageError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const online = connection.isOnline()
  const stale = isChunkLoadFailure(error) && online
  const action = stale
    ? chunkFailureAction({ online: true, lastReloadAt: lastChunkReloadAt(), now: Date.now() })
    : null
  const retry = useCallback(() => {
    reset()
    void router.invalidate()
  }, [reset, router])

  useEffect(() => {
    if (action === 'reload') reloadForNewVersion()
  }, [action])

  if (isNotFound(error)) return <ConsoleNotFoundPage />
  if (!online || isNetworkFailure(error) || (isChunkLoadFailure(error) && !online)) {
    return <OfflinePage onRetry={retry} />
  }
  if (action === 'reload') return null
  return <LazyServerErrorPage reference={errorReference(error)} onRetry={retry} />
}

/** The layout itself failed: the same pages inside the shell frame. */
export function ConsoleRouteError(props: ErrorComponentProps) {
  return (
    <ConsoleShell>
      <ConsolePageError {...props} />
    </ConsoleShell>
  )
}
