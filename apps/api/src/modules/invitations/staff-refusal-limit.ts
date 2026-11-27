import { os as baseOs, ORPCError } from '@orpc/server'
import type { BaseContext } from '@/context'
import { tooManyRequests } from '@/lib/errors'

const HOUR = 60 * 60_000
/** "Can't be invited" answers an organization may get per hour (audit L4). */
export const STAFF_REFUSALS_PER_HOUR = 5

/**
 * The invite sheet mustn't become a way to test which emails are staff accounts: after a few
 * "can't be invited" answers in an hour, the organization gets the generic wait instead.
 */
export function limitStaffRefusals() {
  return baseOs
    .$context<BaseContext & { organizationId: string }>()
    .middleware(async ({ context, next }) => {
      try {
        return await next()
      } catch (error) {
        const reason = (error as ORPCError<string, { reason?: string }>).data?.reason
        if (error instanceof ORPCError && error.code === 'CONFLICT' && reason === 'staff_account') {
          const wait = context.rateLimiter.hit(
            `staffRefusal:${context.organizationId}`,
            STAFF_REFUSALS_PER_HOUR,
            HOUR,
          )
          if (wait > 0)
            throw tooManyRequests('Too many attempts. Wait a while and try again.', wait)
        }
        throw error
      }
    })
}
