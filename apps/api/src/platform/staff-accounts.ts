import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { clearSecondFactors } from '@/auth/clear-second-factors'
import type { DbOrTx } from '@/db/client'
import { accounts, platformAdmins, staffInvitations, users } from '@/db/schema'

// Staff accounts (decision 0023, admin-console plan §1b.4). A staff account's state is derived:
// - active: an active platform_admins row;
// - joining: a pending, unexpired staff invitation started by this account;
// - closed: neither (only revoked rows, no password, no factors, no sessions).

export type StaffAccountState = 'active' | 'joining' | 'closed'

/** One query. Only meaningful for a staff account. */
export async function staffAccountState(
  db: DbOrTx,
  userId: string,
  now = new Date(),
): Promise<StaffAccountState> {
  const [row] = await db
    .select({
      active: sql<boolean>`exists (select 1 from ${platformAdmins} where ${platformAdmins.userId} = ${userId} and ${platformAdmins.revokedAt} is null)`,
      joining: sql<boolean>`exists (select 1 from ${staffInvitations} where ${staffInvitations.userId} = ${userId} and ${staffInvitations.status} = 'pending' and ${staffInvitations.expiresAt} > ${now})`,
    })
    .from(users)
    .where(eq(users.id, userId))
  if (row?.active) return 'active'
  if (row?.joining) return 'joining'
  return 'closed'
}

/** Closes a staff account: no factors, no sessions, no password, so nothing signs in again. */
export async function closeStaffAccount(
  tx: DbOrTx,
  userId: string,
): Promise<{ sessionsEnded: number; passkeysRemoved: number }> {
  const cleared = await clearSecondFactors(tx, userId, { mode: 'close' })
  await tx
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
  return cleared
}

/**
 * Undoes a half-made staff account. A never-joined account is deleted (its sessions, password and
 * factors cascade; it has no history, since account events reach the platform trail only once
 * someone has been a super-admin). A former super-admin re-invited and stopped half-way keeps the
 * row, which their history links to, and goes back to closed.
 */
async function discardAccount(tx: DbOrTx, userId: string): Promise<void> {
  await tx
    .update(staffInvitations)
    .set({ userId: null, startedAt: null })
    .where(and(eq(staffInvitations.userId, userId), sql`${staffInvitations.status} <> 'accepted'`))
  const [history] = await tx
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1)
  if (history) await closeStaffAccount(tx, userId)
  else await tx.delete(users).where(eq(users.id, userId))
}

/**
 * Every unfinished staff account whose invitation is no longer pending and unexpired. Runs inside
 * every staff-invitation write and on a refused sign-in, so an unfinished account never outlives
 * the next staff action (there's no job system). Closed accounts are skipped: nothing links them.
 */
export async function discardUnfinishedStaffAccounts(
  tx: DbOrTx,
  now = new Date(),
): Promise<number> {
  // Lock order: always the platform_admins lock before any staff invitation row (re-entrant).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.accountKind, 'staff'),
        sql`not exists (select 1 from ${platformAdmins} where ${platformAdmins.userId} = ${users.id} and ${platformAdmins.revokedAt} is null)`,
        sql`not exists (select 1 from ${staffInvitations} where ${staffInvitations.userId} = ${users.id} and ${staffInvitations.status} = 'pending' and ${staffInvitations.expiresAt} > ${now})`,
        sql`(exists (select 1 from ${staffInvitations} where ${staffInvitations.userId} = ${users.id} and ${staffInvitations.status} <> 'accepted')
          or (exists (select 1 from ${accounts} where ${accounts.userId} = ${users.id} and ${accounts.providerId} = 'credential')
            and not exists (select 1 from ${platformAdmins} where ${platformAdmins.userId} = ${users.id})))`,
      ),
    )
  for (const row of rows) await discardAccount(tx, row.id)
  return rows.length
}

/** The joining account started on this invitation, if any, discarded (resend and withdraw). */
export async function discardStaffAccountOf(tx: DbOrTx, invitationId: string): Promise<void> {
  const [row] = await tx
    .select({ userId: staffInvitations.userId })
    .from(staffInvitations)
    .where(and(eq(staffInvitations.id, invitationId), sql`${staffInvitations.userId} is not null`))
  if (!row?.userId) return
  const [active] = await tx
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, row.userId), isNull(platformAdmins.revokedAt)))
  if (!active) await discardAccount(tx, row.userId)
}

/** Staff accounts among these emails (customer invitations refuse them). */
export async function staffEmails(db: DbOrTx, emails: readonly string[]): Promise<string[]> {
  if (emails.length === 0) return []
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.email, [...emails]), eq(users.accountKind, 'staff')))
  return rows.map((r) => r.email)
}

/** An open staff invitation counts as "pending and unexpired". */
export const openInvitation = (now: Date) =>
  and(eq(staffInvitations.status, 'pending'), gt(staffInvitations.expiresAt, now))
