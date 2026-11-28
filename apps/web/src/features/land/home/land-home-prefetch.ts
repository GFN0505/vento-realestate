import type { QueryClient } from '@tanstack/react-query'
import { landHomeQuery } from '@/features/land/parcels-queries'
import { uuidParam } from '@/lib/search-params'

/** Home's loader starts the land read through this small chunk, beside the page's own code. */
export function prefetchLandHome(queryClient: QueryClient, entity: string | undefined): void {
  void queryClient.prefetchQuery(landHomeQuery(uuidParam(entity)))
}
