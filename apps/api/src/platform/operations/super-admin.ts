import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, users } from '@/db/schema'
import { CommandError } from '../command-error'
import { type PlatformActor, recordPlatformAudit } from '../platform-audit'
import { activeSuperAdminCount } from '../super-admins'

async function userByEmail(db: DbOrTx, email: string) {
  const [row] = await db
    .select({ id: users.id, name: users.name, twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
  if (!row) throw new CommandError(`No Vento account uses ${email}.`)
  return row
}

export async function listSuperAdmins(db: DbOrTx) {
  return db
    .select({ name: users.name, email: users.email, since: platformAdmins.createdAt })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .where(isNull(platformAdmins.revokedAt))
    .orderBy(platformAdmins.createdAt)
}

/**
 * Makes someone a Vento super-admin. They need two-step on. `bootstrap` (no `--by`) works only
 * while there are none, for the first one on a new environment.
 */
export async function grantSuperAdmin(
  db: DbOrTx,
  actor: PlatformActor | 'bootstrap',
  input: { email: string; reason: string; operator: string | null },
): Promise<string> {
  return db.transaction(async (tx) => {
    // Serialises grants, so two bootstraps can't both see "none".
    await tx.execute(`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
    if (actor === 'bootstrap' && (await activeSuperAdminCount(tx)) > 0) {
      throw new CommandError('Super-admins already exist. Use --by with one of them.')
    }
    const user = await userByEmail(tx, input.email)
    if (!user.twoFactorEnabled) {
      throw new CommandError(
        `${user.name} needs two-step sign-in on before becoming a super-admin.`,
      )
    }
    const [existing] = await tx
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.revokedAt)))
    if (existing) throw new CommandError(`${user.name} is already a super-admin.`)
    const by: PlatformActor =
      actor === 'bootstrap' ? { userId: null, name: 'Bootstrap', operator: input.operator } : actor
    await tx.insert(platformAdmins).values({
      userId: user.id,
      reason: input.reason,
      grantedByUserId: by.userId,
    })
    await recordPlatformAudit(tx, {
      actor: by,
      action: 'superadmin.granted',
      targetType: 'user',
      targetKey: user.id,
      after: { name: user.name },
      reason: input.reason,
    })
    return `${user.name} is now a Vento super-admin.`
  })
}

export async function revokeSuperAdmin(
  db: DbOrTx,
  actor: PlatformActor,
  input: { email: string; reason: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const user = await userByEmail(tx, input.email)
    if (user.id === actor.userId)
      throw new CommandError("You can't remove yourself. Ask another super-admin.")
    const [revoked] = await tx
      .update(platformAdmins)
      .set({ revokedAt: new Date(), revokedByUserId: actor.userId })
      .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.revokedAt)))
      .returning({ id: platformAdmins.id })
    if (!revoked) throw new CommandError(`${user.name} isn't a super-admin.`)
    await recordPlatformAudit(tx, {
      actor,
      action: 'superadmin.revoked',
      targetType: 'user',
      targetKey: user.id,
      before: { name: user.name },
      reason: input.reason,
    })
    return `${user.name} is no longer a Vento super-admin.`
  })
}
