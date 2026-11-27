import { ORPCError } from '@orpc/server'

/**
 * STUB (brick 4): a procedure whose contract exists but whose service isn't built yet. Remove
 * with the last stub. 501, so nobody mistakes it for a permission or data answer.
 */
export function notImplemented(): never {
  throw new ORPCError('NOT_IMPLEMENTED', {
    message: "This part of Vento Real Estate isn't ready yet.",
  })
}
