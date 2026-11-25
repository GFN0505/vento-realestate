import { oc } from '@orpc/contract'
import { z } from 'zod'

export const healthStatus = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
  time: z.iso.datetime(),
})
export type HealthStatus = z.infer<typeof healthStatus>

export const healthContract = {
  check: oc.route({ method: 'GET' }).output(healthStatus),
}
