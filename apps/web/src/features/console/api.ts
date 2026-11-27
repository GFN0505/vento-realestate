import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { NotFoundData } from '@vento/shared'
import type { ConsoleContract } from '@vento/shared/console'
import { connection } from '@/lib/connection'
import { isNetworkFailure } from '@/lib/error-data'
import { consoleGate } from './gate/console-gate'

type ConsoleRouter = { console: ConsoleContract }
type ConsoleReason = NonNullable<NotFoundData>['reason']

/** Why the console refused, when it's about the window or two-step (super-admins only). */
export function consoleRefusal(error: unknown): ConsoleReason | null {
  if (!(error instanceof ORPCError) || error.code !== 'NOT_FOUND') return null
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null || !('reason' in data)) return null
  return data.reason === 'console_window_closed' || data.reason === 'console_two_step_required'
    ? data.reason
    : null
}

/**
 * A closed window asks "Confirm it's you", then sends the same request again: same input, so a
 * change keeps its idempotency key and can't apply twice. Backing out fails it with its own error.
 */
export async function proveAndRetry<T>(next: () => Promise<T>): Promise<T> {
  try {
    return await next()
  } catch (error) {
    if (isNetworkFailure(error)) connection.reportNetworkFailure()
    const reason = consoleRefusal(error)
    if (reason === 'console_two_step_required') consoleGate.twoStepMissing()
    if (reason === 'console_window_closed' && (await consoleGate.prove())) return next()
    throw error
  }
}

/**
 * The console's own link to `/rpc` (plan §9.1): no tab-organization header. UNAUTHORIZED reaches
 * the query client, which opens the Session expired dialog as everywhere else.
 */
const link = new RPCLink({
  url: () => `${window.location.origin}/rpc`,
  interceptors: [({ next }) => proveAndRetry(() => next())],
})

export const consoleClient: ContractRouterClient<ConsoleRouter> = createORPCClient(link)

/** `consoleOrpc.console.organizations.list.queryOptions({ input })`. Keys start with "console". */
export const consoleOrpc = createTanstackQueryUtils(consoleClient)

/** Every console query, for invalidating after a change. */
export const consoleKey = () => consoleOrpc.console.key()
