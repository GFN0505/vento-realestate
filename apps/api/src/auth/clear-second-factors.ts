import { eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { passkeys, sessions, twoFactors, users } from '@/db/schema'

/**
 * Removes a person's second factors and ends every session, inside the caller's transaction.
 * - `reset` (lost phone): sign-in stays refused until they set a new password from the emailed
 *   link, then they set two-step up again. Shared by an owner's reset and a super-admin's.
 * - `reset_keep_password` (the break-glass command): the password still works; two-step is set
 *   up again at the next sign-in.
 * - `close` (a removed super-admin's staff account): factors and sessions gone; the caller also
 *   removes the password (`closeStaffAccount` in platform/staff-accounts.ts), so nothing signs in.
 */
export async function clearSecondFactors(
  tx: DbOrTx,
  userId: string,
  options: { mode: 'reset' | 'reset_keep_password' | 'close' },
): Promise<{ sessionsEnded: number; passkeysRemoved: number }> {
  // The same per-person lock the passkeys insert trigger takes (migration 0010): a registration
  // in flight either lands first and is deleted below, or waits and is refused as reset-pending.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`)
  await tx.delete(twoFactors).where(eq(twoFactors.userId, userId))
  // A lost phone's passkey must stop working too (spec 3d). Before the sessions go, in the
  // same transaction: registration needs a session, so none can be added meanwhile.
  const removedPasskeys = await tx
    .delete(passkeys)
    .where(eq(passkeys.userId, userId))
    .returning({ id: passkeys.id })
  await tx
    .update(users)
    .set(
      options.mode === 'close'
        ? { twoFactorEnabled: false }
        : {
            twoFactorEnabled: false,
            twoStepSetupRequired: true,
            passwordResetRequired: options.mode === 'reset',
          },
    )
    .where(eq(users.id, userId))
  const ended = await tx
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id })
  return { sessionsEnded: ended.length, passkeysRemoved: removedPasskeys.length }
}
