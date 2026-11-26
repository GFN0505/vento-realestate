import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { type Contract, ORGANIZATION_HEADER } from '@vento/shared'
import { notifyNotFound } from '@/lib/availability-events'
import { connection } from '@/lib/connection'
import { isNetworkFailure, isNotFound, isOrganizationChanged } from '@/lib/error-data'
import { expectedOrganizationId, reloadForOrganizationChange } from '@/lib/tab-organization'

const link = new RPCLink({
  url: () => `${window.location.origin}/rpc`,
  // Decision 0013: name the organization this tab shows. The server only ever uses it to refuse.
  headers: () => {
    const id = expectedOrganizationId()
    return id ? { [ORGANIZATION_HEADER]: id } : {}
  },
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      } catch (error) {
        if (isOrganizationChanged(error)) reloadForOrganizationChange()
        if (isNetworkFailure(error)) connection.reportNetworkFailure()
        // Maybe a feature was switched off: the shell refetches `me` (spec "no flash").
        if (isNotFound(error)) notifyNotFound()
        throw error
      }
    },
  ],
})

/** Typed client for the API, generated from the shared contract. */
export const client: ContractRouterClient<Contract> = createORPCClient(link)

/** TanStack Query helpers: `useQuery(orpc.health.check.queryOptions())`. */
export const orpc = createTanstackQueryUtils(client)
