import { useSearch } from '@tanstack/react-router'
import { uuidParam } from '@/lib/search-params'

/**
 * The top bar's company as Home's land reads send it (decision 0014): the address's id, which
 * the server intersects with the viewer's companies, exactly as the parcels list does.
 */
export function useHomeEntityId(): string | undefined {
  return useSearch({ from: '/_app/_shell', select: (s) => uuidParam(s.entity) })
}
