import { ORPCError } from '@orpc/client'
import { type ErrorComponentProps, useMatches, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import { ModuleForbiddenError } from '@/features/shell/module-forbidden-error'
import { connection } from '@/lib/connection'
import { errorReference, isChunkLoadFailure, isNetworkFailure } from '@/lib/error-data'
import { useInShell } from './error-state'
import { LazyForbiddenPage, LazyNotFoundPage, LazyServerErrorPage } from './lazy-pages'
import { OfflinePage } from './offline-page'

/**
 * Every route's error boundary (plan 6.1). Inside the shell the page area shows the designed
 * page and the shell stays; outside it (the shell itself failed) the page stands alone.
 * "Try again" resets the boundary and reloads the route's data, never the whole page.
 */
export function ShellRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const inShell = useInShell()
  const leafModule = useMatches({ select: (m) => m.at(-1)?.staticData?.module })
  const retry = useCallback(() => {
    reset()
    void router.invalidate()
  }, [reset, router])

  if (inShell && error instanceof ModuleForbiddenError)
    return <LazyForbiddenPage module={error.module} />
  if (inShell && error instanceof ORPCError && error.code === 'FORBIDDEN') {
    return <LazyForbiddenPage module={leafModule} />
  }
  if (inShell && error instanceof ORPCError && error.code === 'NOT_FOUND')
    return <LazyNotFoundPage />
  if (isNetworkFailure(error) || isChunkLoadFailure(error) || !connection.isOnline()) {
    return <OfflinePage onRetry={retry} />
  }
  return <LazyServerErrorPage reference={errorReference(error)} onRetry={retry} />
}
