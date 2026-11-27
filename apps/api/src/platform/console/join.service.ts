import { ORPCError } from '@orpc/server'
import { AUTH_ERROR_MESSAGES } from '@vento/shared'
import type { StaffJoinPreview, StaffJoinStartInput } from '@vento/shared/console'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, sql } from 'drizzle-orm'
import { checkPasswordPolicy } from '@/auth/password-policy'
import { rememberPasswordHash } from '@/auth/security-store'
import type { DbOrTx } from '@/db/client'
import { accounts, staffInvitations, users } from '@/db/schema'
import { conflict } from '@/lib/errors'
import { hashInvitationToken } from '@/modules/invitations/invitation-token'
import { discardUnfinishedStaffAccounts } from '../staff-accounts'

// The staff sign-up's two public steps (admin-console plan §1b.5). The token proves the inbox;
// Better Auth then owns the session, the two-step secret and the backup codes.

type Row = typeof staffInvitations.$inferSelect

async function byToken(db: DbOrTx, token: string, lock = false): Promise<Row | null> {
  const query = db
    .select()
    .from(staffInvitations)
    .where(eq(staffInvitations.tokenHash, hashInvitationToken(token)))
  const [row] = lock ? await query.for('update') : await query
  return row ?? null
}

async function nameOf(db: DbOrTx, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId))
  return row?.name ?? null
}

async function hasCustomerAccount(db: DbOrTx, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), eq(users.accountKind, 'customer')))
  return Boolean(row)
}

function statusOf(row: Row, now: Date): StaffJoinPreview['status'] {
  if (row.status === 'pending') return row.expiresAt > now ? 'pending' : 'expired'
  return row.status
}

const UNKNOWN: StaffJoinPreview = {
  status: 'expired',
  email: null,
  name: null,
  inviterName: null,
  expiresAt: null,
  resume: false,
}

/** What the sign-up page shows. An unknown token reads as expired and names nobody. */
export async function get(db: DbOrTx, token: string, now = new Date()): Promise<StaffJoinPreview> {
  const row = await byToken(db, token)
  if (!row) return UNKNOWN
  const status = statusOf(row, now)
  const customer = status === 'pending' && (await hasCustomerAccount(db, row.email))
  return {
    status: customer ? 'customer_account' : status,
    email: row.email,
    name: row.name,
    inviterName: await nameOf(db, row.invitedByUserId),
    expiresAt: row.expiresAt.toISOString(),
    resume: status === 'pending' && !customer && row.userId !== null,
  }
}

const REFUSALS = {
  expired: 'This invitation has expired. Ask a Vento Real Estate super-admin to send a new one.',
  withdrawn:
    'This invitation was withdrawn. Ask a Vento Real Estate super-admin if you still need access.',
  accepted: 'This invitation has already been used.',
} as const

/**
 * Step 1: makes the staff account (or, for a closed former one, gives the same row a new name and
 * password) and starts the invitation. On resume the account exists: the router's sign-in checks
 * the password and `name` is ignored. Returns the email to sign in with.
 */
export async function start(
  db: DbOrTx,
  input: StaffJoinStartInput,
  now = new Date(),
): Promise<{ email: string; resume: boolean }> {
  return db.transaction(async (tx) => {
    // The same lock as every staff-invitation write, so a resend or withdraw can't interleave.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
    await discardUnfinishedStaffAccounts(tx, now)
    const row = await byToken(tx, input.token, true)
    const status = row ? statusOf(row, now) : 'expired'
    if (!row) throw conflict('invitation_expired', REFUSALS.expired)
    if (status === 'expired') {
      const inviter = await nameOf(tx, row.invitedByUserId)
      throw conflict(
        'invitation_expired',
        inviter
          ? `This invitation has expired. Ask ${inviter} to send a new one.`
          : REFUSALS.expired,
      )
    }
    if (status === 'withdrawn') throw conflict('invitation_withdrawn', REFUSALS.withdrawn)
    if (status === 'accepted') throw conflict('invitation_not_pending', REFUSALS.accepted)
    if (await hasCustomerAccount(tx, row.email)) {
      const inviter = (await nameOf(tx, row.invitedByUserId)) ?? 'a Vento Real Estate super-admin'
      throw conflict(
        'staff_customer_account',
        `${row.email} now has a Vento Real Estate customer account, so it can't be a staff account. Ask ${inviter} to invite a different email.`,
      )
    }
    if (row.userId) return { email: row.email, resume: true }

    const failure = checkPasswordPolicy(input.password)
    if (failure) {
      throw new ORPCError('BAD_REQUEST', {
        message: AUTH_ERROR_MESSAGES[failure],
        data: { reason: failure },
      })
    }
    const passwordHash = await hashPassword(input.password)
    const name = input.name ?? row.name
    // A closed former staff account starts fresh on the same row, so its history still links.
    const [closed] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, row.email), eq(users.accountKind, 'staff')))
    let userId: string
    if (closed) {
      await tx
        .update(users)
        .set({
          name,
          emailVerified: true,
          twoStepSetupRequired: false,
          passwordResetRequired: false,
        })
        .where(eq(users.id, closed.id))
      userId = closed.id
    } else {
      const [user] = await tx
        .insert(users)
        .values({ name, email: row.email, emailVerified: true, accountKind: 'staff' })
        .returning({ id: users.id })
      if (!user) throw new Error('User insert returned nothing')
      userId = user.id
    }
    await tx
      .insert(accounts)
      .values({ accountId: userId, providerId: 'credential', userId, password: passwordHash })
    await rememberPasswordHash(tx, userId, passwordHash)
    await tx
      .update(staffInvitations)
      .set({ userId, startedAt: now })
      .where(eq(staffInvitations.id, row.id))
    return { email: row.email, resume: false }
  })
}
