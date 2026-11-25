import { implement } from '@orpc/server'
import { contract } from '@vento/shared'
import { authedMiddleware, memberMiddleware } from '@/access/middleware'
import type { BaseContext } from '@/context'

/** Procedures implement the shared contract, so input and output types can't drift. */
export const os = implement(contract).$context<BaseContext>()

/** Signed in (any membership state). */
export const authed = os.use(authedMiddleware)

/** A member of an organization, before two-step is set up: onboarding only. */
export const memberPendingTwoStep = authed.use(memberMiddleware(false))

/** A member, with two-step set up when their role requires it. Add requirePermission per procedure. */
export const member = authed.use(memberMiddleware(true))
