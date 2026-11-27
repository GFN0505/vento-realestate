import { consoleOrpc } from '../api'

/** One read for the whole Dashboard; refetched when the tab comes back (spec). */
export const dashboardQuery = () =>
  consoleOrpc.console.dashboard.get.queryOptions({
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

/** Organization detail's Account activity card. */
export const accountActivityQuery = (id: string) =>
  consoleOrpc.console.organizations.accountActivity.queryOptions({ input: { id } })
