import { and, eq, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, users } from '@/db/schema'
import { CommandError } from './command-error'
import type { PlatformActor } from './platform-audit'

export const NOT_SUPER_ADMIN = 'Only Vento super-admins can change flags and plans.'

/**
 * The `--by` person: an active super-admin with two-step on. Anything else gets the same
 * refusal, so the command doesn't confirm who has an account.
 */
export async function requireSuperAdmin(
  db: DbOrTx,
  email: string | undefined,
  operator: string | null,
): Promise<PlatformActor> {
  if (!email) throw new CommandError(NOT_SUPER_ADMIN)
  const [row] = await db
    .select({ id: users.id, name: users.name, twoFactorEnabled: users.twoFactorEnabled })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .where(and(eq(users.email, email.trim().toLowerCase()), isNull(platformAdmins.revokedAt)))
  if (!row?.twoFactorEnabled) throw new CommandError(NOT_SUPER_ADMIN)
  return { userId: row.id, name: row.name, operator }
}

export async function activeSuperAdminCount(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformAdmins)
    .where(isNull(platformAdmins.revokedAt))
  return row?.n ?? 0
}
