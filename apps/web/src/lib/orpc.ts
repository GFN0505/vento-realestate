import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { Contract } from '@vento/shared'

const link = new RPCLink({ url: () => `${window.location.origin}/rpc` })

/** Typed client for the API, generated from the shared contract. */
export const client: ContractRouterClient<Contract> = createORPCClient(link)

/** TanStack Query helpers: `useQuery(orpc.health.check.queryOptions())`. */
export const orpc = createTanstackQueryUtils(client)
