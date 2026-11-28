import { createFileRoute } from '@tanstack/react-router'
import { canSeeChecklist, checklistQuery } from '@/features/checklist/checklist-queries'
import { loadLandHome } from '@/features/land/home/land-home-lazy'
import { effectiveAccessFrom } from '@/features/preview/use-effective-permissions'
import { needsLandHome } from '@/features/shell/home-kpis'
import { HomePage } from '@/features/shell/home-page'

/** Home's address: `?sheet=upload` is Upload document (Land & legal, phones), so Back closes it. */
type HomeSearch = { sheet?: 'upload' }

export const Route = createFileRoute('/_app/_shell/')({
  // Hand-written, not zod: route search validation runs in the entry bundle.
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    search.sheet === 'upload' ? { sheet: 'upload' } : {},
  // The sheet isn't a dep: opening Upload document never refetches Home.
  loaderDeps: ({ search }) => ({ entity: search.entity }),
  loader: ({ context, deps }) => {
    // The numbers' icons load beside the page, not in the first-load bundle (kpi-icon.tsx).
    void import('@/features/shell/kpi-glyphs')
    // Not awaited: Home never waits for the checklist; it appears as soon as it arrives.
    const access = effectiveAccessFrom(context.queryClient)
    if (access && canSeeChecklist(access)) {
      void context.queryClient.prefetchQuery(checklistQuery())
    }
    // Land & title's tile, queue and pipeline: their code and their read start together.
    if (access && needsLandHome(access)) {
      loadLandHome().catch(() => {
        // Offline: the tile stays plain; the next visit tries again.
      })
      void import('@/features/land/home/land-home-prefetch').then(
        (m) => m.prefetchLandHome(context.queryClient, deps.entity),
        () => {},
      )
    }
  },
  component: HomePage,
})
