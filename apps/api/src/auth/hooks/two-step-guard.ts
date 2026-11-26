import { AUTH_ERROR_CODES } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { twoFactors } from '@/db/schema'
import { backupCodeUsedAlert } from '@/email/templates/security-alert'
import { formatDate, formatTime } from '@/lib/format'
import { requestScope } from '@/lib/request-scope'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import {
  activeLockUntil,
  clearTwoStepSetupRequired,
  findUserById,
  type IdentityUser,
} from '../security-store'
import { afterSignIn, type SignInContext } from './after-sign-in'
import { type AuthDeps, errorCode, sendEmail, webUrl } from './deps'
import { lockAccount, lockedError, lockedResponse } from './sign-in-guard'

/**
 * The verify endpoints serve two jobs: the code after a password (sign-in mode, no session
 * yet) and confirming a newly scanned authenticator (setup mode, signed in). The before hook
 * works out which, and who, and leaves it in the request scope for the after hook.
 */
export async function beforeTwoStepVerify(
  deps: AuthDeps,
  input: { sessionUser: IdentityUser | null; pendingUserId: string | null },
): Promise<void> {
  const scope = requestScope()
  if (input.sessionUser) {
    scope.auth = {
      twoStepMode: 'setup',
      userId: input.sessionUser.id,
      wasTwoFactorEnabled: input.sessionUser.twoFactorEnabled,
    }
    return
  }
  scope.auth = { twoStepMode: 'sign_in', userId: input.pendingUserId ?? undefined }
  if (!input.pendingUserId) return
  const user = await findUserById(deps.db, input.pendingUserId)
  // A password lock also blocks the code step, and vice versa.
  const until = user && (await activeLockUntil(deps.db, user.email))
  if (until) throw lockedError(until)
}

async function twoStepLockedUntil(deps: AuthDeps, userId: string): Promise<Date | null> {
  const [row] = await deps.db
    .select({ lockedUntil: twoFactors.lockedUntil })
    .from(twoFactors)
    .where(eq(twoFactors.userId, userId))
  return row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null
}

export async function afterTwoStepVerify(
  deps: AuthDeps,
  ctx: SignInContext,
  input: { method: 'totp' | 'backup_code'; returned: unknown },
): Promise<Response | undefined> {
  const { twoStepMode, userId, wasTwoFactorEnabled } = requestScope().auth
  if (!userId) return
  const user = await findUserById(deps.db, userId)
  if (!user) return
  const code = errorCode(input.returned)

  if (twoStepMode === 'setup') {
    if (!code && input.method === 'totp' && !wasTwoFactorEnabled) {
      await clearTwoStepSetupRequired(deps.db, user.id)
      await recordAccountEvent(deps.db, {
        userId: user.id,
        action: 'two_step.enabled',
        actor: { userId: user.id, name: user.name },
      })
    }
    return
  }

  if (code === 'ACCOUNT_TEMPORARILY_LOCKED') {
    const until = await twoStepLockedUntil(deps, user.id)
    return until ? lockedResponse(until) : undefined
  }
  if (code === AUTH_ERROR_CODES.INVALID_CODE || code === AUTH_ERROR_CODES.INVALID_BACKUP_CODE) {
    await recordAccountEvent(deps.db, {
      userId: user.id,
      action: 'auth.two_step_failed',
      actor: { userId: null, name: 'Sign-in attempt' },
      metadata: { method: input.method },
    })
    // Better Auth's own lockout (5 in a row, 15 minutes) set locked_until: mirror it as a
    // sign-in lock so the password step refuses too, then alert.
    const until = await twoStepLockedUntil(deps, user.id)
    if (until) {
      await lockAccount(deps, { email: user.email, reason: 'two_step', lockedUntil: until })
      return lockedResponse(until)
    }
    return
  }
  if (code) return

  await afterSignIn(deps, ctx, user, input.method)
  if (input.method === 'backup_code') await onBackupCodeUsed(deps, user)
}

async function onBackupCodeUsed(deps: AuthDeps, user: IdentityUser): Promise<void> {
  const { backupCodes } = await deps.api().viewBackupCodes({ body: { userId: user.id } })
  const now = new Date()
  await recordAccountEvent(deps.db, {
    userId: user.id,
    action: 'two_step.backup_code_used',
    actor: { userId: user.id, name: user.name },
    metadata: { remaining: backupCodes.length },
  })
  await sendEmail(
    deps,
    user.email,
    'security_alert',
    backupCodeUsedAlert({
      left: backupCodes.length,
      at: formatTime(now),
      on: formatDate(now),
      resetUrl: webUrl('/forgot-password'),
    }),
  )
}
