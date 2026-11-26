import { createFileRoute, Outlet, retainSearchParams } from '@tanstack/react-router'
import { LazyNotFoundPage } from '@/components/errors/lazy-pages'
import { AppShell } from '@/components/shell/app-shell'
import { entitiesQuery } from '@/features/entity/use-current-entity'

type ShellSearch = { entity?: string }

export const Route = createFileRoute('/_app/_shell')({
  // Hand-written (no zod in the entry). Any short string is kept so an unavailable id can be
  // reported once and dropped; the entity hook does that (decision 0014).
  validateSearch: (search: Record<string, unknown>): ShellSearch =>
    typeof search.entity === 'string' && search.entity.length > 0 && search.entity.length <= 64
      ? { entity: search.entity }
      : {},
  // The entity stays selected across pages, back and forward.
  search: { middlewares: [retainSearchParams(['entity'])] },
  loader: ({ context }) => {
    // Not awaited: the switcher shows a skeleton; pages never wait for it.
    void context.queryClient.prefetchQuery(entitiesQuery())
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  // A thrown notFound replaces this route's component, so the 404 brings the shell with it.
  notFoundComponent: () => (
    <AppShell>
      <LazyNotFoundPage />
    </AppShell>
  ),
})
