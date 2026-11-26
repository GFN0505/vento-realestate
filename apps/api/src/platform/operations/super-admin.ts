import type { PreviewLine } from '@vento/shared/console'
import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, sessions, users } from '@/db/schema'
import { type PlatformActor, recordPlatformAudit } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { activeSuperAdminCount } from '../super-admins'
import type { Preview } from './release'

/** The owner asked for a second approver from four super-admins on (not built in slice 1). */
const SECOND_APPROVER_AT = 4

type Person = { id: string; name: string; email: string; twoFactorEnabled: boolean }

export type SuperAdminTarget = { email: string } | { userId: string }

async function findPerson(db: DbOrTx, target: SuperAdminTarget): Promise<Person> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .where(
      'email' in target
        ? eq(users.email, target.email.trim().toLowerCase())
        : eq(users.id, target.userId),
    )
  if (!row) {
    throw new PlatformError(
      'email' in target
        ? `No Vento account uses ${target.email}.`
        : 'No Vento account has that id.',
      'not_found',
    )
  }
  return row
}

async function isActive(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
  return Boolean(row)
}

export async function listSuperAdmins(db: DbOrTx) {
  return db
    .select({ name: users.name, email: users.email, since: platformAdmins.createdAt })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .where(isNull(platformAdmins.revokedAt))
    .orderBy(platformAdmins.createdAt)
}

function needsTwoStep(person: Person) {
  return new PlatformError(
    `${person.name} needs two-step sign-in on before becoming a super-admin.`,
  )
}

const alreadyOne = (person: Person) => new PlatformError(`${person.name} is already a super-admin.`)

export async function previewGrant(
  db: DbOrTx,
  target: SuperAdminTarget,
): Promise<Preview<Record<string, never>>> {
  const person = await findPerson(db, target)
  if (!person.twoFactorEnabled) throw needsTwoStep(person)
  if (await isActive(db, person.id)) throw alreadyOne(person)
  const lines: PreviewLine[] = [
    { text: `${person.name} (${person.email}) will become a Vento super-admin.`, tone: 'info' },
  ]
  if ((await activeSuperAdminCount(db)) + 1 >= SECOND_APPROVER_AT) {
    lines.push({
      text: "This makes four or more super-admins. The owner asked for a second approver from four on; that's not built yet.",
      tone: 'warning',
    })
  }
  return { lines, expected: {} }
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
      throw new PlatformError('Super-admins already exist. Use --by with one of them.')
    }
    const user = await findPerson(tx, { email: input.email })
    if (!user.twoFactorEnabled) throw needsTwoStep(user)
    if (await isActive(tx, user.id)) throw alreadyOne(user)
    const by: PlatformActor =
      actor === 'bootstrap'
        ? { userId: null, name: 'Bootstrap', channel: 'command', operator: input.operator }
        : actor
    await tx.insert(platformAdmins).values({
      userId: user.id,
      reason: input.reason,
      grantedByUserId: by.userId,
    })
    const done = `${user.name} is now a Vento super-admin.`
    await recordPlatformAudit(tx, {
      actor: by,
      action: 'superadmin.granted',
      targetType: 'user',
      targetKey: user.id,
      after: { name: user.name },
      reason: input.reason,
      done,
    })
    return done
  })
}

const selfRemoval = () => new PlatformError("You can't remove yourself. Ask another super-admin.")
const notOne = (person: Person) => new PlatformError(`${person.name} isn't a super-admin.`)

export async function previewRevoke(
  db: DbOrTx,
  actor: Pick<PlatformActor, 'userId'>,
  target: SuperAdminTarget,
): Promise<Preview<Record<string, never>>> {
  const person = await findPerson(db, target)
  if (person.id === actor.userId) throw selfRemoval()
  if (!(await isActive(db, person.id))) throw notOne(person)
  return {
    lines: [
      { text: `${person.name} (${person.email}) will no longer be a super-admin.`, tone: 'info' },
      {
        text: 'Their console closes at once. Their access to customer organizations stays as it is.',
        tone: 'info',
      },
    ],
    expected: {},
  }
}

/** Removes a super-admin and closes the console on every session they have, in one transaction. */
export async function revokeSuperAdmin(
  db: DbOrTx,
  actor: PlatformActor,
  input: SuperAdminTarget & { reason: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    // The same lock as grants: two super-admins removing each other at once can't leave none.
    await tx.execute(`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
    const user = await findPerson(tx, input)
    if (user.id === actor.userId) throw selfRemoval()
    // The actor may have been removed while this waited (R1).
    if (!actor.userId || !(await isActive(tx, actor.userId))) {
      throw new PlatformError("You're no longer a Vento super-admin.")
    }
    const [revoked] = await tx
      .update(platformAdmins)
      .set({ revokedAt: new Date(), revokedByUserId: actor.userId })
      .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.revokedAt)))
      .returning({ id: platformAdmins.id })
    if (!revoked) throw notOne(user)
    if ((await activeSuperAdminCount(tx)) === 0) {
      throw new PlatformError('There must always be at least one super-admin.')
    }
    await tx
      .update(sessions)
      .set({ consoleOpenedAt: null, consoleActiveAt: null })
      .where(eq(sessions.userId, user.id))
    const done = `${user.name} is no longer a Vento super-admin.`
    await recordPlatformAudit(tx, {
      actor,
      action: 'superadmin.revoked',
      targetType: 'user',
      targetKey: user.id,
      before: { name: user.name },
      reason: input.reason,
      done,
    })
    return done
  })
}
