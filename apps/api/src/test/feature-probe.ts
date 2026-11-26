import { createRouterClient, implement } from '@orpc/server'
import { forFeature } from '@vento/shared'
import { z } from 'zod'
import { authedMiddleware, memberMiddleware, requirePermission } from '@/access/middleware'
import type { BaseContext } from '@/context'

// A test-only module: until real modules exist, it proves the gate on feature-keyed procedures.
const sales = forFeature('sales')
const commissions = forFeature('sales.commissions')

export const probeContract = {
  sales: { list: sales.output(z.object({ ok: z.literal(true) })) },
  commissions: { list: commissions.output(z.object({ ok: z.literal(true) })) },
}

const os = implement(probeContract).$context<BaseContext>()
const member = os.use(authedMiddleware).use(memberMiddleware(true))

export const probeRouter = os.router({
  sales: {
    list: member.sales.list
      .use(requirePermission('sales', 'view', 'see sales'))
      .handler(() => ({ ok: true as const })),
  },
  commissions: {
    list: member.commissions.list
      .use(requirePermission('sales', 'view', 'see commissions'))
      .handler(() => ({ ok: true as const })),
  },
})

export function probeClient(context: BaseContext) {
  return createRouterClient(probeRouter, { context })
}
