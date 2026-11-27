import type { FeatureKey } from '@vento/shared'
import type { ReleasesSearch } from '@/routes/console/-search'
import { consoleOrpc } from '../api'

/** The whole catalog (about 45 rows), so no pagination (plan §5.3). */
export const releasesQuery = (filter: ReleasesSearch['filter']) =>
  consoleOrpc.console.releases.list.queryOptions({ input: { filter: filter ?? 'all' } })

export const releaseQuery = (key: FeatureKey) =>
  consoleOrpc.console.releases.get.queryOptions({ input: { key } })
