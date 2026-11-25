import { os } from '@/orpc'
import { checkHealth } from './health.service'

export const healthRouter = {
  check: os.health.check.handler(({ context }) => checkHealth(context.db)),
}
