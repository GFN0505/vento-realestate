import { os as baseOs, ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { CONSOLE_ADMIN_ACTIVITY_WRITE_MS } from '@/auth/policy'
import type { BaseContext } from '@/context'
import { platformAdmins, sessions } from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { PlatformError } from '@/platform/platform-error'
import { type ActiveSuperAdmin, activeSuperAdmin } from '@/platform/super-admins'
import { consoleWindow } from './console-window'
import type { AuthSession, AuthUser } from './context'

// The Vento console chain (admin-console plan §4.4): authed → superAdmin → consoleWindow →
// platformErrors. The console carries no organization: the tab header is never read here.

type AuthedContext = BaseContext & { user: AuthUser; session: AuthSession }
export type SuperAdminContext = AuthedContext & { admin: ActiveSuperAdmin }

const NOT_FOUND_MESSAGE = "We couldn't find that. It may have been removed."

/** Only ever sent to an active super-admin, who already knows they are one. */
function consoleNotFound(reason: 'console_window_closed' | 'console_two_step_required') {
  return new ORPCError('NOT_FOUND', { message: NOT_FOUND_MESSAGE, data: { reason } })
}

/**
 * An active Vento super-admin, in one query. Anyone else gets a plain NOT_FOUND: to them the
 * console doesn't exist. `allowWithoutTwoStep` is for `access.status` alone, which reports it.
 */
export function superAdminMiddleware(options: { allowWithoutTwoStep?: boolean } = {}) {
  return baseOs.$context<AuthedContext>().middleware(async ({ context, next }) => {
    const admin = await activeSuperAdmin(context.db, context.user.id)
    if (!admin) throw notFound()
    if (!admin.twoFactorEnabled && !options.allowWithoutTwoStep) {
      throw consoleNotFound('console_two_step_required')
    }
    return next({ context: { admin } })
  })
}

/**
 * The window must be open on this session (decided in memory). An open window records the
 * request, so the 15 idle minutes start again; "Last console activity" at most once a minute.
 */
export const consoleWindowMiddleware = baseOs
  .$context<SuperAdminContext>()
  .middleware(async ({ context, next }) => {
    const now = new Date()
    if (!consoleWindow(context.session, now).open) throw consoleNotFound('console_window_closed')
    await context.db
      .update(sessions)
      .set({ consoleActiveAt: now })
      .where(eq(sessions.id, context.session.id))
    const last = context.admin.lastConsoleAt?.getTime() ?? 0
    if (now.getTime() - last >= CONSOLE_ADMIN_ACTIVITY_WRITE_MS) {
      await context.db
        .update(platformAdmins)
        .set({ lastConsoleAt: now })
        .where(eq(platformAdmins.userId, context.admin.userId))
    }
    return next()
  })

/** Operation refusals as the shared errors, so console handlers need no try/catch. */
export function toConsoleError(error: PlatformError): ORPCError<string, unknown> {
  if (error.kind === 'not_found') return notFound(error.message)
  if (error.kind === 'stale') {
    return conflict('platform_stale', error.message, {
      ...(error.extra.changedByName && { changedByName: error.extra.changedByName }),
    })
  }
  return conflict('platform_refused', error.message, {
    ...(error.extra.next && { next: error.extra.next }),
  })
}

export const platformErrorsMiddleware = baseOs
  .$context<BaseContext>()
  .middleware(async ({ next }) => {
    try {
      return await next()
    } catch (error) {
      if (error instanceof PlatformError) throw toConsoleError(error)
      throw error
    }
  })
