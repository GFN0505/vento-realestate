import { consoleOrpc } from '../api'

/** Plans change rarely and the list is short: one read serves the list, sheets and pickers. */
export const plansQuery = () => consoleOrpc.console.plans.list.queryOptions({ staleTime: 60_000 })

export const planQuery = (key: string) =>
  consoleOrpc.console.plans.get.queryOptions({ input: { key } })
