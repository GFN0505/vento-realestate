import { useQueryClient } from '@tanstack/react-query'
import { type ErrorComponentProps, useMatches, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { meQuery } from '@/features/account/api'
import { routeModule } from '@/features/shell/route-module'
import { chunkFailureAction, lastChunkReloadAt, reloadForNewVersion } from '@/lib/chunk-errors'
import { connection } from '@/lib/connection'
import { errorReference } from '@/lib/error-data'
import { twoStepSetupUi } from '@/lib/two-step-setup-ui'
import { useInShell } from './error-state'
import { LazyForbiddenPage, LazyNotFoundPage, LazyServerErrorPage } from './lazy-pages'
import { OfflinePage } from './offline-page'
import { routeErrorKind } from './route-error-kind'

/**
 * Every route's error boundary (plan 6.1). Inside the shell the page area shows the designed
 * page and the shell stays; outside it (the shell itself failed) the page stands alone.
 * "Try again" resets the boundary and reloads the route's data, never the whole page.
 */
export function ShellRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const inShell = useInShell()
  const module = useMatches({ select: routeModule })
  const kind = routeErrorKind(error, { inShell, online: connection.isOnline() })
  // A new deploy: one guarded full reload; if that already happened, say something went wrong.
  const staleAction =
    kind === 'stale_code'
      ? chunkFailureAction({ online: true, lastReloadAt: lastChunkReloadAt(), now: Date.now() })
      : null
  const retry = useCallback(() => {
    reset()
    void router.invalidate()
  }, [reset, router])

  useEffect(() => {
    if (kind === 'two_step' && inShell) {
      // The setup opens over the page (3d); finishing it reloads this route's data.
      twoStepSetupUi.open('required')
    } else if (kind === 'two_step') {
      // Fresh `me` first, so the guard sees the new step and sends them to two-step setup.
      void queryClient
        .refetchQueries({ queryKey: meQuery().queryKey })
        .then(() => router.invalidate())
    }
    if (staleAction === 'reload') reloadForNewVersion()
    if (kind === 'toast') {
      void import('@/lib/api-errors').then((m) => m.toastApiError(error))
    }
  }, [kind, inShell, staleAction, error, queryClient, router])

  switch (kind) {
    case 'forbidden':
      return <LazyForbiddenPage module={module} />
    case 'not_found':
      return <LazyNotFoundPage />
    case 'offline':
      return <OfflinePage onRetry={retry} />
    case 'stale_code':
      return staleAction === 'reload' ? null : (
        <LazyServerErrorPage reference={null} onRetry={retry} />
      )
    case 'server':
      return <LazyServerErrorPage reference={errorReference(error)} onRetry={retry} />
    default:
      // two_step redirects; toast explains. The shell around stays usable.
      return null
  }
}
