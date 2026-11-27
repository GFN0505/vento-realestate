import { and, eq, isNull, sql } from 'drizzle-orm'
import { clearSecondFactors } from '@/auth/clear-second-factors'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, sessions, staffInvitations, users } from '@/db/schema'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import { type PlatformActor, recordPlatformAudit } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { closeStaffAccount, discardUnfinishedStaffAccounts } from '../staff-accounts'
import { activeSuperAdminCount } from '../super-admins'
import type { Preview } from './release'

type Person = {
  id: string
  name: string
  email: string
  twoFactorEnabled: boolean
  accountKind: 'customer' | 'staff'
}

const NO_LONGER_ONE = "You're no longer a Vento Real Estate super-admin."

export type SuperAdminTarget = { email: string } | { userId: string }

async function findPerson(db: DbOrTx, target: SuperAdminTarget): Promise<Person> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      twoFactorEnabled: users.twoFactorEnabled,
      accountKind: users.accountKind,
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
        ? `No Vento Real Estate account uses ${target.email}.`
        : 'No Vento Real Estate account has that id.',
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

/** `superadmin grant` is gone (decision 0023): staff join by invitation. */
export const GRANT_REFUSAL = 'Super-admins join by invitation. Use superadmin invite.'

/** Pending (or expired, still revivable) invitations this person sent. */
async function openInvitationsFrom(db: DbOrTx, userId: string) {
  return db
    .select({ id: staffInvitations.id, name: staffInvitations.name, email: staffInvitations.email })
    .from(staffInvitations)
    .where(
      and(
        eq(staffInvitations.invitedByUserId, userId),
        sql`${staffInvitations.status} in ('pending', 'expired')`,
      ),
    )
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
  const sent = await openInvitationsFrom(db, person.id)
  return {
    lines: [
      ...(sent.length
        ? [
            {
              text: `Their ${sent.length === 1 ? 'open invitation is' : `${sent.length} open invitations are`} withdrawn: ${sent.map((i) => i.name).join(', ')}.`,
              tone: 'info' as const,
            },
          ]
        : []),
      { text: `${person.name} (${person.email}) will no longer be a super-admin.`, tone: 'info' },
      {
        text: "Their staff account closes: they're signed out everywhere and can't sign in. Their name stays on past activity.",
        tone: 'info',
      },
    ],
    expected: {},
  }
}

/**
 * Removes a super-admin and, in the same transaction, closes their staff account: every session,
 * passkey, authenticator and the password go, so they can't sign in (decision 0023). Their name
 * stays on past activity; inviting the email again starts fresh on the same account.
 */
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
      throw new PlatformError(NO_LONGER_ONE)
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
    // Invitations they sent stop working: nobody joins on a removed person's word (review 2).
    for (const invitation of await openInvitationsFrom(tx, user.id)) {
      await tx
        .update(staffInvitations)
        .set({
          status: 'withdrawn',
          respondedAt: new Date(),
          withdrawnByUserId: actor.userId,
          userId: null,
          startedAt: null,
        })
        .where(eq(staffInvitations.id, invitation.id))
      await recordPlatformAudit(tx, {
        actor: { ...actor, idempotencyKey: undefined, requestHash: undefined },
        action: 'superadmin.invitation_withdrawn',
        targetType: 'staff_invitation',
        targetKey: invitation.id,
        before: { name: invitation.name, email: invitation.email },
        reason: `${user.name} was removed as a super-admin`,
      })
    }
    await discardUnfinishedStaffAccounts(tx)
    if (user.accountKind === 'staff') {
      await closeStaffAccount(tx, user.id)
    } else {
      // A legacy super-admin on a customer account (before 0014): only the console closes.
      await tx
        .update(sessions)
        .set({ consoleOpenedAt: null, consoleActiveAt: null })
        .where(eq(sessions.userId, user.id))
    }
    const done = `${user.name} is no longer a Vento Real Estate super-admin.`
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

const ownReset = () =>
  new PlatformError("You can't reset your own two-step. Ask another super-admin.")

/**
 * Your own two-step: only from the host's command line, with --break-glass (the owner's answer,
 * 27 Nov 2026), so a lone super-admin who lost phone and backup codes isn't locked out. Host
 * access is super-admin power anyway (decisions 0015 and 0021). The console never allows it.
 */
const mayResetSelf = (actor: Pick<PlatformActor, 'channel'>, allowSelf: boolean | undefined) =>
  allowSelf === true && actor.channel === 'command'

export async function previewResetTwoStep(
  db: DbOrTx,
  actor: Pick<PlatformActor, 'userId' | 'channel'>,
  target: SuperAdminTarget,
  options: { allowSelf?: boolean } = {},
): Promise<Preview<Record<string, never>>> {
  const person = await findPerson(db, target)
  const self = person.id === actor.userId
  if (self && !mayResetSelf(actor, options.allowSelf)) throw ownReset()
  if (!(await isActive(db, person.id))) throw notOne(person)
  if (self) {
    return {
      lines: [
        {
          text: "Your two-step is cleared, your passkeys are removed and you're signed out everywhere.",
          tone: 'warning',
        },
        {
          text: 'We email you a link to set a new password; then set up two-step again before the console opens. Every other super-admin and the security inbox are told.',
          tone: 'info',
        },
      ],
      expected: {},
    }
  }
  return {
    lines: [
      {
        text: `${person.name} is signed out everywhere and their passkeys are removed.`,
        tone: 'info',
      },
      {
        text: 'They get an email to set a new password, then set up two-step again at their next sign-in.',
        tone: 'info',
      },
    ],
    expected: {},
  }
}

/**
 * A lost phone (admin-console plan §1b.7): two-step cleared, every session ended, and sign-in
 * refused until a new password is set from the emailed link (the caller asks Better Auth for it
 * after commit). The link is the inbox proof: a password alone never gets back in (audit M1),
 * from the console or the break-glass command, your own reset included.
 */
export async function resetSuperAdminTwoStep(
  db: DbOrTx,
  actor: PlatformActor,
  input: SuperAdminTarget & { reason: string; allowSelf?: boolean },
): Promise<{
  done: string
  person: { id: string; name: string; email: string }
  counts: Counts
  self: boolean
}> {
  return db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
    const person = await findPerson(tx, input)
    const self = person.id === actor.userId
    if (self && !mayResetSelf(actor, input.allowSelf)) throw ownReset()
    if (!actor.userId || !(await isActive(tx, actor.userId))) {
      throw new PlatformError(NO_LONGER_ONE)
    }
    if (!(await isActive(tx, person.id))) throw notOne(person)
    const counts = await clearSecondFactors(tx, person.id, { mode: 'reset' })
    const done = self ? 'Your two-step was reset' : `${person.name}'s two-step was reset`
    await recordPlatformAudit(tx, {
      actor,
      action: 'superadmin.two_step_reset',
      targetType: 'user',
      targetKey: person.id,
      before: { name: person.name },
      reason: input.reason,
      metadata: { ...counts, self },
      done,
    })
    await recordAccountEvent(tx, {
      userId: person.id,
      action: 'two_step.reset',
      actor: { userId: actor.userId, name: actor.name },
      metadata: counts,
    })
    return {
      done,
      person: { id: person.id, name: person.name, email: person.email },
      counts,
      self,
    }
  })
}

type Counts = { sessionsEnded: number; passkeysRemoved: number }
