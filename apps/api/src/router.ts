import { healthRouter } from '@/modules/health/health.router'
import { os } from '@/orpc'

export const router = os.router({
  health: healthRouter,
})
export type Router = typeof router
