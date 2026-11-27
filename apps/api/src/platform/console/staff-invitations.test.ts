import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { platformAuditEvents, staffInvitations, users } from '@/db/schema'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  createStaffInvitation,
  createSuperAdmin,
  createUser,
  type TestUser,
} from '@/test/factories'
import { consoleClientAs } from '@/test/router-client'
import { inviteSuperAdmin } from '../operations/staff-invitations'

// Staff invitations in the console (admin-console plan §1b.5, spec "Staff invitation and staff
// sign-up"). The staff sign-up itself, over HTTP, is in staff-sign-up.test.ts.

const why = { reason: 'Joins the release rota' }
const key = () => ({ idempotencyKey: randomUUID() })
const HOUR = 60 * 60_000

/** Other test files commit invitations: expire them here (rolled back) so counts start at 0. */
async function quiet(tx: DbOrTx) {
  // The production lock order: the platform_admins lock before any invitation row.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
  await tx
    .update(staffInvitations)
    .set({ expiresAt: new Date(Date.now() - HOUR) })
    .where(eq(staffInvitations.status, 'pending'))
}

async function invite(tx: DbOrTx, ada: TestUser, email: string, name = 'Tunde Bello') {
  const { client, mailer } = consoleClientAs(tx, ada)
  const preview = await client.console.superAdmins.invite.preview({ email, name })
  const done = await client.console.superAdmins.invite.apply({
    email,
    name,
    expected: preview.expected,
    ...why,
    ...key(),
  })
  return { client, mailer, preview, done }
}

describe('inviting a super-admin', () => {
  it('makes a 48-hour invitation, emails the invitee and the others, and records it', () =>
    withRollback(async (tx) => {
      await quiet(tx)
      const ada = await createSuperAdmin(tx)
      const other = await createSuperAdmin(tx, { name: 'Bola Ade' })
      const email = uniqueEmail('tunde')
      const before = Date.now()
      const { mailer, preview, done } = await invite(tx, ada, email)
      expect(done).toEqual({ message: 'Invitation sent to Tunde Bello' })
      expect(preview.lines.map((l) => l.text).slice(0, 2)).toEqual([
        `Tunde Bello (${email}) gets an email to join. The link works for 48 hours.`,
        'They become a super-admin only after setting a password and two-step sign-in.',
      ])
      const [row] = await tx
        .select()
        .from(staffInvitations)
        .where(eq(staffInvitations.email, email))
      expect(row?.status).toBe('pending')
      expect(row?.invitedByUserId).toBe(ada.id)
      const ttl = (row?.expiresAt.getTime() ?? 0) - before
      expect(ttl).toBeGreaterThanOrEqual(48 * HOUR - 1000)
      expect(ttl).toBeLessThanOrEqual(48 * HOUR + 5000)
      const [message] = mailer.to(email)
      expect(message?.tag).toBe('staff_invitation')
      expect(message?.text).toContain('/staff-invitation/')
      expect(mailer.to(other.email)).toHaveLength(1)
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.targetKey, row?.id ?? ''))
      expect(event).toMatchObject({
        action: 'superadmin.invited',
        targetType: 'staff_invitation',
        channel: 'console',
        actorUserId: ada.id,
      })
    }))

  it('refuses an active super-admin', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Bello' })
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.invite.preview({ email: tunde.email, name: 'Tunde Bello' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Tunde Bello is already a super-admin.',
      })
    }))

  it('refuses an email with an open invitation and offers Resend on it', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const open = await createStaffInvitation(tx, { invitedBy: ada })
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.invite.preview({ email: open.email, name: 'Tunde Bello' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'platform_refused', next: 'resend_invitation', invitationId: open.id },
        message: expect.stringMatching(/already has an invitation that expires /),
      })
    }))

  it('refuses a sixth open invitation', () =>
    withRollback(async (tx) => {
      await quiet(tx)
      const ada = await createSuperAdmin(tx)
      for (let i = 0; i < 5; i++) await createStaffInvitation(tx, { invitedBy: ada })
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.invite.preview({ email: uniqueEmail('six'), name: 'Kemi Ojo' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'There are 5 open invitations. Withdraw one or wait for it to be accepted.',
      })
    }))

  it('invites a closed (former) staff account again', () =>
    withRollback(async (tx) => {
      await quiet(tx)
      const ada = await createSuperAdmin(tx)
      const former = await createSuperAdmin(tx, { name: 'Tunde Bello' }, { revoked: true })
      await expect(invite(tx, ada, former.email)).resolves.toMatchObject({
        done: { message: 'Invitation sent to Tunde Bello' },
      })
    }))

  it('applies once per key: the same key again sends nothing more', () =>
    withRollback(async (tx) => {
      await quiet(tx)
      const ada = await createSuperAdmin(tx)
      const email = uniqueEmail('tunde')
      const { client, mailer } = consoleClientAs(tx, ada)
      const input = { email, name: 'Tunde Bello', expected: {}, ...why, ...key() }
      await client.console.superAdmins.invite.apply(input)
      await client.console.superAdmins.invite.apply(input)
      expect(mailer.to(email)).toHaveLength(1)
      const rows = await tx.select().from(staffInvitations).where(eq(staffInvitations.email, email))
      expect(rows).toHaveLength(1)
    }))
})

describe('resending', () => {
  it('gives a fresh link and 48 hours; the old link reads as expired', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const invitation = await createStaffInvitation(tx, { invitedBy: ada })
      const { client, mailer } = consoleClientAs(tx, ada)
      await client.console.superAdmins.resendInvitation({ invitationId: invitation.id, ...key() })
      expect(mailer.to(invitation.email)).toHaveLength(1)
      await expect(client.console.join.get({ token: invitation.token })).resolves.toMatchObject({
        status: 'expired',
        email: null,
      })
      const link = mailer.to(invitation.email)[0]?.text.match(/staff-invitation\/([\w-]+)/)?.[1]
      await expect(client.console.join.get({ token: link ?? '' })).resolves.toMatchObject({
        status: 'pending',
        inviterName: 'Ada Okafor',
      })
    }))

  it('refuses a second resend within a minute', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const invitation = await createStaffInvitation(tx, { lastSentAt: new Date() })
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.resendInvitation({ invitationId: invitation.id, ...key() }),
      ).rejects.toMatchObject({ code: 'CONFLICT', message: 'Wait a minute before resending.' })
    }))

  it('revives an expired invitation, and discards a half-made account so it starts fresh', () =>
    withRollback(async (tx) => {
      await quiet(tx)
      const ada = await createSuperAdmin(tx)
      const invitation = await createStaffInvitation(tx, { status: 'expired', started: true })
      const { client } = consoleClientAs(tx, ada)
      await client.console.superAdmins.resendInvitation({ invitationId: invitation.id, ...key() })
      const [row] = await tx
        .select()
        .from(staffInvitations)
        .where(eq(staffInvitations.id, invitation.id))
      expect(row).toMatchObject({ status: 'pending', userId: null, startedAt: null })
      expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now())
      expect(
        await tx
          .select()
          .from(users)
          .where(eq(users.id, invitation.user?.id ?? '')),
      ).toEqual([])
    }))
})

describe('withdrawing', () => {
  it('stops the link at once', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const invitation = await createStaffInvitation(tx)
      const { client } = consoleClientAs(tx, ada)
      const preview = await client.console.superAdmins.withdrawInvitation.preview({
        invitationId: invitation.id,
      })
      await client.console.superAdmins.withdrawInvitation.apply({
        invitationId: invitation.id,
        expected: preview.expected,
        reason: 'Wrong email',
        ...key(),
      })
      await expect(client.console.join.get({ token: invitation.token })).resolves.toMatchObject({
        status: 'withdrawn',
      })
    }))

  it('is stale when the invitation was accepted meanwhile', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const invitation = await createStaffInvitation(tx, { status: 'accepted' })
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.withdrawInvitation.apply({
          invitationId: invitation.id,
          expected: { status: 'pending' },
          reason: 'Wrong email',
          ...key(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'platform_stale' } })
    }))
})

describe('expiry', () => {
  it('expires exactly 48 hours after it was sent', () =>
    withRollback(async (tx) => {
      await quiet(tx)
      const ada = await createSuperAdmin(tx)
      const sentAt = new Date('2026-11-27T12:00:00.000Z')
      const email = uniqueEmail('tunde')
      const actor = { userId: ada.id, name: ada.name, channel: 'console' as const, operator: null }
      await inviteSuperAdmin(
        tx,
        actor,
        { email, name: 'Tunde Bello', ...why, operator: null },
        sentAt,
      )
      const [row] = await tx
        .select()
        .from(staffInvitations)
        .where(eq(staffInvitations.email, email))
      expect(row?.expiresAt.toISOString()).toBe('2026-11-29T12:00:00.000Z')
    }))

  it('lists an expired invitation as Expired', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const invitation = await createStaffInvitation(tx, { status: 'expired' })
      const { client } = consoleClientAs(tx, ada)
      const list = await client.console.superAdmins.invitations()
      expect(list.find((i) => i.id === invitation.id)?.status).toBe('expired')
    }))
})

describe('the staff sign-up page (join.get)', () => {
  it.each(['pending', 'expired', 'withdrawn', 'accepted'] as const)(
    'shows a %s invitation',
    (status) =>
      withRollback(async (tx) => {
        const ada = await createSuperAdmin(tx)
        const invitation = await createStaffInvitation(tx, { status, invitedBy: ada })
        const { client } = consoleClientAs(tx, null)
        await expect(client.console.join.get({ token: invitation.token })).resolves.toMatchObject({
          status,
          email: invitation.email,
          inviterName: 'Ada Okafor',
          resume: false,
        })
      }),
  )

  it('says when the email got a customer account meanwhile, and start creates nothing', () =>
    withRollback(async (tx) => {
      const invitation = await createStaffInvitation(tx)
      await createUser(tx, { email: invitation.email })
      const { client } = consoleClientAs(tx, null)
      await expect(client.console.join.get({ token: invitation.token })).resolves.toMatchObject({
        status: 'customer_account',
      })
      await expect(
        client.console.join.start({ token: invitation.token, password: 'Parkview-gate-2026' }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'staff_customer_account' } })
      const staff = await tx
        .select()
        .from(users)
        .where(and(eq(users.email, invitation.email), eq(users.accountKind, 'staff')))
      expect(staff).toEqual([])
    }))

  it('refuses to start a withdrawn or used invitation', () =>
    withRollback(async (tx) => {
      const withdrawn = await createStaffInvitation(tx, { status: 'withdrawn' })
      const used = await createStaffInvitation(tx, { status: 'accepted' })
      const { client } = consoleClientAs(tx, null)
      const start = (token: string) =>
        client.console.join.start({ token, password: 'Parkview-gate-2026' })
      await expect(start(withdrawn.token)).rejects.toMatchObject({
        data: { reason: 'invitation_withdrawn' },
      })
      await expect(start(used.token)).rejects.toMatchObject({
        data: { reason: 'invitation_not_pending' },
        message: 'This invitation has already been used.',
      })
    }))

  it('resumes a started invitation', () =>
    withRollback(async (tx) => {
      const invitation = await createStaffInvitation(tx, { started: true })
      const { client } = consoleClientAs(tx, null)
      await expect(client.console.join.get({ token: invitation.token })).resolves.toMatchObject({
        status: 'pending',
        resume: true,
      })
    }))
})
