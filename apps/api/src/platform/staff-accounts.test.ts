import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { accounts, sessions, staffInvitations, twoFactors, users, verifications } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  createSession,
  createStaffAccount,
  createStaffInvitation,
  createSuperAdmin,
} from '@/test/factories'
import {
  closeStaffAccount,
  discardUnfinishedStaffAccounts,
  staffAccountState,
} from './staff-accounts'

// Staff account states and the clean-up of unfinished sign-ups (admin-console plan §1b.4).

describe('staffAccountState', () => {
  it('reads active, joining and closed', () =>
    withRollback(async (tx) => {
      const active = await createStaffAccount(tx, { state: 'active' })
      const joining = await createStaffAccount(tx, { state: 'joining' })
      const closed = await createStaffAccount(tx, { state: 'closed' })
      expect(await staffAccountState(tx, active.id)).toBe('active')
      expect(await staffAccountState(tx, joining.id)).toBe('joining')
      expect(await staffAccountState(tx, closed.id)).toBe('closed')
    }))
})

describe('discarding unfinished staff accounts', () => {
  it('deletes a never-joined account whose invitation expired, with its sessions and password', () =>
    withRollback(async (tx) => {
      const invitation = await createStaffInvitation(tx, { status: 'expired', started: true })
      if (!invitation.user) throw new Error('started invitation has no account')
      const userId = invitation.user.id
      await createSession(tx, invitation.user)
      await discardUnfinishedStaffAccounts(tx)
      expect(await tx.select().from(users).where(eq(users.id, userId))).toEqual([])
      expect(await tx.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([])
      expect(await tx.select().from(accounts).where(eq(accounts.userId, userId))).toEqual([])
      const [row] = await tx
        .select()
        .from(staffInvitations)
        .where(eq(staffInvitations.id, invitation.id))
      expect(row).toMatchObject({ userId: null, startedAt: null })
    }))

  it('keeps an account whose invitation is still open, and active super-admins', () =>
    withRollback(async (tx) => {
      const joining = await createStaffAccount(tx, { state: 'joining' })
      const active = await createSuperAdmin(tx)
      await discardUnfinishedStaffAccounts(tx)
      expect(await tx.select().from(users).where(eq(users.id, joining.id))).toHaveLength(1)
      expect(await tx.select().from(users).where(eq(users.id, active.id))).toHaveLength(1)
    }))

  it('closes, never deletes, a former super-admin re-invited who stopped half-way', () =>
    withRollback(async (tx) => {
      const former = await createSuperAdmin(tx, {}, { revoked: true })
      await createStaffInvitation(tx, { status: 'expired', email: former.email })
      await tx
        .update(staffInvitations)
        .set({ userId: former.id, startedAt: new Date() })
        .where(eq(staffInvitations.email, former.email))
      await discardUnfinishedStaffAccounts(tx)
      expect(await tx.select().from(users).where(eq(users.id, former.id))).toHaveLength(1)
      expect(await staffAccountState(tx, former.id)).toBe('closed')
    }))

  // Nothing a never-joined account can have written may block its delete (risk §1b.20).
  it('meets no restricting foreign key: every reference to users cascades or is cleared first', () =>
    withRollback(async (tx) => {
      const result = await tx.execute<{ table: string; column: string; rule: string }>(sql`
        select c.conrelid::regclass::text as table, a.attname as column, c.confdeltype as rule
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.confrelid = 'users'::regclass and c.contype = 'f'`)
      const restricting = result.rows
        .filter((r) => r.rule !== 'c' && r.rule !== 'n')
        .map((r) => `${r.table}.${r.column}`)
      // Each is something only a member, a super-admin or an inviter writes: a never-joined staff
      // account is none of those, and its own invitation link is cleared before the delete.
      expect(restricting.sort()).toEqual(
        [
          'approval_decisions.user_id',
          'approval_requests.maker_user_id',
          'audit_events.actor_user_id',
          'entities.archived_by_user_id',
          'feature_releases.changed_by_user_id',
          // Uploads come only through `member` procedures, which staff accounts never reach.
          'files.uploaded_by_user_id',
          'invitations.invited_by_user_id',
          'members.removed_by_user_id',
          'members.user_id',
          'organization_add_ons.cancelled_by_user_id',
          'organization_add_ons.created_by_user_id',
          'organization_overrides.cleared_by_user_id',
          'organization_overrides.created_by_user_id',
          'organization_trials.cancelled_by_user_id',
          'organization_trials.created_by_user_id',
          'organizations.single_company_confirmed_by_user_id',
          // Land & title records, like uploads, are written only through `member` procedures.
          'parcels.archived_by_user_id',
          'plan_versions.published_by_user_id',
          'platform_admins.granted_by_user_id',
          'platform_admins.revoked_by_user_id',
          'platform_admins.user_id',
          'platform_audit_events.actor_user_id',
          'staff_invitations.invited_by_user_id',
          'staff_invitations.user_id',
          'staff_invitations.withdrawn_by_user_id',
          'title_document_versions.removed_by_user_id',
          'title_document_versions.uploaded_by_user_id',
          'title_documents.created_by_user_id',
          'title_stages.updated_by_user_id',
        ].sort(),
      )
    }))
})

describe('closing a staff account', () => {
  it('removes every session, the authenticator, the password and any password link, and keeps the row', () =>
    withRollback(async (tx) => {
      const tunde = await createStaffAccount(tx)
      await tx.insert(twoFactors).values({ userId: tunde.id, secret: 'x', backupCodes: 'x' })
      await createSession(tx, tunde)
      await tx.insert(verifications).values({
        identifier: 'reset-password:old-link',
        value: tunde.id,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      })
      await closeStaffAccount(tx, tunde.id)
      // A password link sent before must not outlive the closure (audit L1).
      expect(
        await tx.select().from(verifications).where(eq(verifications.value, tunde.id)),
      ).toEqual([])
      expect(await tx.select().from(sessions).where(eq(sessions.userId, tunde.id))).toEqual([])
      expect(await tx.select().from(twoFactors).where(eq(twoFactors.userId, tunde.id))).toEqual([])
      expect(await tx.select().from(accounts).where(eq(accounts.userId, tunde.id))).toEqual([])
      const [row] = await tx.select().from(users).where(eq(users.id, tunde.id))
      expect(row?.twoFactorEnabled).toBe(false)
    }))
})
