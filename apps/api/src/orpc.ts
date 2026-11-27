import { implement } from '@orpc/server'
import {
  consoleWindowMiddleware,
  platformErrorsMiddleware,
  superAdminMiddleware,
} from '@/access/console-middleware'
import { authedMiddleware, memberMiddleware } from '@/access/middleware'
import { apiContract } from '@/api-contract'
import type { BaseContext } from '@/context'

/**
 * Procedures implement the shared contracts (customer and console), so input and output types
 * can't drift.
 */
export const os = implement(apiContract).$context<BaseContext>()

/** Signed in (any membership state). */
export const authed = os.use(authedMiddleware)

/** A member of an organization, before two-step is set up: onboarding only. */
export const memberPendingTwoStep = authed.use(memberMiddleware(false))

/** A member, with two-step set up when their role requires it. Add requirePermission per procedure. */
export const member = authed.use(memberMiddleware(true))

/**
 * An active Vento super-admin (decision 0021), before the console window: `console.access.*`
 * only. Everyone else gets NOT_FOUND. Never use for anything that changes or reads customers.
 */
export const superAdmin = authed.use(superAdminMiddleware()).use(platformErrorsMiddleware)

/** `console.access.status` alone: answers a super-admin without two-step, to say so. */
export const superAdminAnyTwoStep = authed
  .use(superAdminMiddleware({ allowWithoutTwoStep: true }))
  .use(platformErrorsMiddleware)

/** Every other console procedure: super-admin with two-step, console window open. */
export const consoleWindow = authed
  .use(superAdminMiddleware())
  .use(consoleWindowMiddleware)
  .use(platformErrorsMiddleware)
