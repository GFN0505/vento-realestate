import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import type { ConsoleContract } from '@vento/shared/console'
import { connection } from '@/lib/connection'
import { isNetworkFailure } from '@/lib/error-data'

type JoinRouter = { console: { join: ConsoleContract['join'] } }

/**
 * The staff sign-up's own client (plan §1b.13): only the two public `console.join.*` procedures,
 * no console window interceptors (there's no console yet) and no organization header.
 */
const link = new RPCLink({
  url: () => `${window.location.origin}/rpc`,
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      } catch (error) {
        if (isNetworkFailure(error)) connection.reportNetworkFailure()
        throw error
      }
    },
  ],
})

export const joinClient: ContractRouterClient<JoinRouter> = createORPCClient(link)
