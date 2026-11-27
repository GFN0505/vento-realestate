import { and, eq, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, users } from '@/db/schema'
import type { PlatformActor } from './platform-audit'
import { PlatformError } from './platform-error'

export const NOT_SUPER_ADMIN = 'Only Vento Real Estate super-admins can change flags and plans.'

/** An active super-admin, with whether two-step is on (the console's per-request lookup). */
export type ActiveSuperAdmin = {
  userId: string
  name: string
  email: string
  twoFactorEnabled: boolean
  lastConsoleAt: Date | null
}

/** One indexed query: the person's active platform_admins row joined to their user. */
export async function activeSuperAdmin(
  db: DbOrTx,
  userId: string,
): Promise<ActiveSuperAdmin | null> {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      twoFactorEnabled: users.twoFactorEnabled,
      lastConsoleAt: platformAdmins.lastConsoleAt,
    })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
  return row ?? null
}

/**
 * The `--by` person: an active super-admin with two-step on. Anything else gets the same
 * refusal, so the command doesn't confirm who has an account.
 */
export async function requireSuperAdmin(
  db: DbOrTx,
  email: string | undefined,
  operator: string | null,
): Promise<PlatformActor> {
  if (!email) throw new PlatformError(NOT_SUPER_ADMIN)
  const [row] = await db
    .select({ id: users.id, name: users.name, twoFactorEnabled: users.twoFactorEnabled })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .where(and(eq(users.email, email.trim().toLowerCase()), isNull(platformAdmins.revokedAt)))
  if (!row?.twoFactorEnabled) throw new PlatformError(NOT_SUPER_ADMIN)
  return { userId: row.id, name: row.name, channel: 'command', operator }
}

export async function activeSuperAdminCount(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformAdmins)
    .where(isNull(platformAdmins.revokedAt))
  return row?.n ?? 0
}

/** Every other active super-admin's name and email (told about additions and removals). */
export async function otherSuperAdmins(
  db: DbOrTx,
  exceptUserIds: readonly string[],
): Promise<{ name: string; email: string }[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .where(isNull(platformAdmins.revokedAt))
  return rows
    .filter((r) => !exceptUserIds.includes(r.id))
    .map(({ name, email }) => ({ name, email }))
}
