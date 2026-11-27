import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, platformAuditEvents, sessions, staffInvitations, users } from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { uniqueEmail, withRollback } from '@/test/db'
import { createSession, createStaffAccount, createSuperAdmin } from '@/test/factories'
import { memoryIo } from './cli/io'
import { runCommand } from './cli/run'

// `pnpm superadmin` after 1b (admin-console plan §1b.8 and the owner's answer).

async function run(db: DbOrTx, args: string[]) {
  const io = memoryIo([true])
  const mailer = createMemoryTransport()
  const code = await runCommand('superadmin', [...args, '--yes'], {
    db,
    io,
    operator: 'ada@api-1',
    mailer,
    now: () => new Date(),
    securityAlertEmail: null,
  })
  return { code, io, mailer }
}

/** No active super-admin, inside this rolled-back transaction (others commit some). */
async function emptyEnvironment(tx: DbOrTx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
  await tx.update(platformAdmins).set({ revokedAt: new Date() })
}

const linkIn = (lines: string[]) => lines.join('\n').match(/\/staff-invitation\/([\w-]+)/)?.[1]

describe('superadmin invite --bootstrap', () => {
  it('prints a one-time link on an empty environment, and a re-run replaces it', () =>
    withRollback(async (tx) => {
      await emptyEnvironment(tx)
      const email = uniqueEmail('first')
      const args = ['invite', '--bootstrap', '--email', email, '--name', 'Ada Okafor']
      const first = await run(tx, args)
      expect(first.code, first.io.errors.join('\n')).toBe(0)
      expect(first.io.output.join('\n')).toMatch(/works for 48 hours/)
      const again = await run(tx, args)
      expect(again.code).toBe(0)
      expect(linkIn(again.io.output)).not.toBe(linkIn(first.io.output))
      const rows = await tx.select().from(staffInvitations).where(eq(staffInvitations.email, email))
      expect(rows.map((r) => r.status).sort()).toEqual(['pending', 'withdrawn'])
      expect(rows.find((r) => r.status === 'pending')).toMatchObject({
        bootstrap: true,
        invitedByUserId: null,
        reason: 'First super-admin',
      })
    }))

  it('refuses while there is a super-admin', () =>
    withRollback(async (tx) => {
      await createSuperAdmin(tx)
      const { code, io } = await run(tx, [
        'invite',
        '--bootstrap',
        '--email',
        uniqueEmail('second'),
        '--name',
        'Tunde Bello',
      ])
      expect(code).toBe(1)
      expect(io.errors).toEqual([
        "There's already a super-admin. Ask them to invite you from the console.",
      ])
    }))
})

describe('superadmin invite --break-glass', () => {
  it('emails the invitation and never prints the link', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const email = uniqueEmail('tunde')
      const { code, io, mailer } = await run(tx, [
        'invite',
        '--email',
        email,
        '--name',
        'Tunde Bello',
        '--by',
        ada.email,
        '--reason',
        'Joins the rota',
        '--break-glass',
      ])
      expect(code, io.errors.join('\n')).toBe(0)
      expect(linkIn(io.output)).toBeUndefined()
      expect(mailer.to(email)[0]?.tag).toBe('staff_invitation')
    }))
})

describe('superadmin grant', () => {
  it('refuses: super-admins join by invitation', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const { code, io } = await run(tx, ['grant', uniqueEmail('x'), '--by', ada.email])
      expect(code).toBe(1)
      expect(io.errors).toEqual(['Super-admins join by invitation. Use superadmin invite.'])
    }))
})

describe('superadmin reset-two-step --break-glass', () => {
  it("clears another super-admin's two-step, keeps the password, and records it", () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createStaffAccount(tx, { name: 'Tunde Bello' })
      await createSession(tx, tunde, { consoleOpenedAt: new Date() })
      const { code, io, mailer } = await run(tx, [
        'reset-two-step',
        tunde.email,
        '--by',
        ada.email,
        '--reason',
        'Lost phone',
        '--break-glass',
      ])
      expect(code, io.errors.join('\n')).toBe(0)
      const [row] = await tx.select().from(users).where(eq(users.id, tunde.id))
      expect(row).toMatchObject({
        twoFactorEnabled: false,
        twoStepSetupRequired: true,
        passwordResetRequired: false,
      })
      expect(await tx.select().from(sessions).where(eq(sessions.userId, tunde.id))).toEqual([])
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.action, 'superadmin.two_step_reset'))
      expect(event).toMatchObject({ channel: 'command', targetKey: tunde.id, actorUserId: ada.id })
      expect(mailer.to(tunde.email)[0]?.tag).toBe('security_alert')
    }))

  it('refuses without --break-glass and refuses your own', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const plain = await run(tx, [
        'reset-two-step',
        ada.email,
        '--by',
        ada.email,
        '--reason',
        'x y z',
      ])
      expect(plain.code).toBe(1)
      const own = await run(tx, [
        'reset-two-step',
        ada.email,
        '--by',
        ada.email,
        '--reason',
        'Lost phone',
        '--break-glass',
      ])
      expect(own.io.errors).toEqual(["You can't reset your own two-step. Ask another super-admin."])
    }))
})
