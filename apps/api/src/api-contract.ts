import { contract } from '@vento/shared'
import { consoleContract } from '@vento/shared/console'

/**
 * What the API implements: the customer contract plus the Vento console's (decision 0021). The
 * console lives on its own package subpath, so the customer web can't import it; the server
 * joins the two here, on the same /rpc handler.
 */
export const apiContract = { ...contract, console: consoleContract }
export type ApiContract = typeof apiContract
