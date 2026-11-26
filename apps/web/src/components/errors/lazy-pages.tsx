import { lazy, Suspense } from 'react'

/*
 * The 403, 404 and 500 pages load only when needed, keeping them out of the first load
 * (plan 6.7). The offline page stays in the main bundle: it must show when chunks can't download.
 */

const Forbidden = lazy(() => import('./forbidden-page').then((m) => ({ default: m.ForbiddenPage })))
const NotFound = lazy(() => import('./not-found-page').then((m) => ({ default: m.NotFoundPage })))
const StandaloneNotFound = lazy(() =>
  import('./not-found-page').then((m) => ({ default: m.StandaloneNotFound })),
)
const ServerError = lazy(() =>
  import('./server-error-page').then((m) => ({ default: m.ServerErrorPage })),
)

export function LazyForbiddenPage(props: Parameters<typeof Forbidden>[0]) {
  return (
    <Suspense fallback={null}>
      <Forbidden {...props} />
    </Suspense>
  )
}

export function LazyNotFoundPage() {
  return (
    <Suspense fallback={null}>
      <NotFound />
    </Suspense>
  )
}

export function LazyStandaloneNotFound() {
  return (
    <Suspense fallback={null}>
      <StandaloneNotFound />
    </Suspense>
  )
}

export function LazyServerErrorPage(props: Parameters<typeof ServerError>[0]) {
  return (
    <Suspense fallback={null}>
      <ServerError {...props} />
    </Suspense>
  )
}
