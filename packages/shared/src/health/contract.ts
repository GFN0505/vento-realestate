import { z } from 'zod'
import { platform } from '../common/errors'

export const healthStatus = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
  time: z.iso.datetime(),
})
export type HealthStatus = z.infer<typeof healthStatus>

export const healthContract = {
  check: platform.route({ method: 'GET' }).output(healthStatus),
}
