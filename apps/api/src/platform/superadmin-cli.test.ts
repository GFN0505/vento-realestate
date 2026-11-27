import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { platformAdmins, platformAuditEvents, sessions, staffInvitations, users } from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { uniqueEmail, withRollback } from '@/test/db'
import { createSession, createStaffAccount, createSuperAdmin } from '@/test/factories'
import { consoleClientAs } from '@/test/router-client'
import { memoryIo } from './cli/io'
import { runCommand } from './cli/run'

// `pnpm superadmin` after 1b (admin-console plan §1b.8 and the owner's answer).

async function run(db: DbOrTx, args: string[], securityAlertEmail: string | null = null) {
  const io = memoryIo([true])
  const mailer = createMemoryTransport()
  // Better Auth runs on the pool and can't see this test's rolled-back rows: record the request.
  const resetLinks: string[] = []
  const code = await runCommand('superadmin', [...args, '--yes'], {
    db,
    io,
    operator: 'ada@api-1',
    mailer,
    now: () => new Date(),
    securityAlertEmail,
    requestPasswordReset: async (email) => {
      resetLinks.push(email)
    },
  })
  return { code, io, mailer, resetLinks }
}

const SECURITY = 'security@ventoerp.com'

const selfReset = (email: string) => [
  'reset-two-step',
  email,
  '--by',
  email,
  '--reason',
  'Lost phone and backup codes',
  '--break-glass',
]

/** No active super-admin, inside this rolled-back transaction (others commit some). */
async function emptyEnvironment(tx: DbOrTx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
  await tx.update(platformAdmins).set({ revokedAt: new Date() })
}

const linkIn = (lines: string[]) => lines.join('\n').match(/\/staff-invitation\/([\w-]+)/)?.[1]

describe('superadmin invite --bootstrap', () => {
  it('emails the one-time link on an empty environment, tells the security inbox, and a re-run replaces it on the record', () =>
    withRollback(async (tx) => {
      await emptyEnvironment(tx)
      const email = uniqueEmail('first')
      const args = ['invite', '--bootstrap', '--email', email, '--name', 'Ada Okafor']
      const first = await run(tx, args, SECURITY)
      expect(first.code, first.io.errors.join('\n')).toBe(0)
      expect(linkIn(first.io.output)).toBeUndefined()
      expect(linkIn(first.mailer.to(email).map((m) => m.text))).toBeDefined()
      expect(first.mailer.to(SECURITY)[0]?.subject).toBe(
        `A bootstrap invitation was made for Ada Okafor (${email})`,
      )
      const again = await run(tx, args)
      expect(again.code).toBe(0)
      const rows = await tx.select().from(staffInvitations).where(eq(staffInvitations.email, email))
      expect(rows.map((r) => r.status).sort()).toEqual(['pending', 'withdrawn'])
      expect(rows.find((r) => r.status === 'pending')).toMatchObject({
        bootstrap: true,
        invitedByUserId: null,
        reason: 'First super-admin',
      })
      const withdrawn = rows.find((r) => r.status === 'withdrawn')
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.targetKey, withdrawn?.id ?? ''),
            eq(platformAuditEvents.action, 'superadmin.invitation_withdrawn'),
          ),
        )
      expect(event).toMatchObject({ channel: 'command', actorName: 'Vento Real Estate (setup)' })
    }))

  it('prints the link only with --print-link, with a warning', () =>
    withRollback(async (tx) => {
      await emptyEnvironment(tx)
      const email = uniqueEmail('first')
      const { code, io } = await run(tx, [
        'invite',
        '--bootstrap',
        '--email',
        email,
        '--name',
        'Ada Okafor',
        '--print-link',
      ])
      expect(code).toBe(0)
      expect(linkIn(io.output)).toBeDefined()
      expect(io.errors.join('\n')).toMatch(/^Warning: this one-time link/)
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
  it("clears another super-admin's two-step, needs a new password from the emailed link, and records it", () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createStaffAccount(tx, { name: 'Tunde Bello' })
      await createSession(tx, tunde, { consoleOpenedAt: new Date() })
      const { code, io, mailer, resetLinks } = await run(tx, [
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
      // A password alone never gets back in (audit M1): the inbox link is the proof.
      expect(row).toMatchObject({
        twoFactorEnabled: false,
        twoStepSetupRequired: true,
        passwordResetRequired: true,
      })
      expect(resetLinks).toEqual([tunde.email])
      expect(io.output.join('\n')).toMatch(/emailed .* a link to set a new password/)
      expect(await tx.select().from(sessions).where(eq(sessions.userId, tunde.id))).toEqual([])
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.action, 'superadmin.two_step_reset'),
            eq(platformAuditEvents.targetKey, tunde.id),
          ),
        )
      expect(event).toMatchObject({ channel: 'command', targetKey: tunde.id, actorUserId: ada.id })
      expect(mailer.to(tunde.email)[0]?.tag).toBe('security_alert')
    }))

  it('refuses without --break-glass', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createStaffAccount(tx, { name: 'Tunde Bello' })
      const plain = await run(tx, [
        'reset-two-step',
        tunde.email,
        '--by',
        ada.email,
        '--reason',
        'Lost phone',
      ])
      expect(plain.code).toBe(1)
      const [row] = await tx.select().from(users).where(eq(users.id, tunde.id))
      expect(row?.twoFactorEnabled).toBe(true)
    }))
})

describe('superadmin reset-two-step on yourself (a lone super-admin, owner 27 Nov 2026)', () => {
  it('lets the only super-admin reset their own two-step, recovering through their inbox, and tells the security inbox', () =>
    withRollback(async (tx) => {
      await emptyEnvironment(tx)
      const ada = await createStaffAccount(tx, { name: 'Ada Okafor' })
      await createSession(tx, ada, { consoleOpenedAt: new Date() })
      const { code, io, mailer, resetLinks } = await run(tx, selfReset(ada.email), SECURITY)
      expect(code, io.errors.join('\n')).toBe(0)
      expect(io.output.join('\n')).toMatch(
        /Open the link we emailed to .*, set a new password, then set up two-step again before the console opens/,
      )
      expect(resetLinks).toEqual([ada.email])
      const [row] = await tx.select().from(users).where(eq(users.id, ada.id))
      expect(row).toMatchObject({
        twoFactorEnabled: false,
        twoStepSetupRequired: true,
        passwordResetRequired: true,
      })
      expect(await tx.select().from(sessions).where(eq(sessions.userId, ada.id))).toEqual([])
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.action, 'superadmin.two_step_reset'),
            eq(platformAuditEvents.targetKey, ada.id),
          ),
        )
      expect(event).toMatchObject({ channel: 'command', actorUserId: ada.id, targetKey: ada.id })
      expect(mailer.to(ada.email).map((m) => m.tag)).toContain('security_alert')
      expect(mailer.to(SECURITY)).toHaveLength(1)
    }))

  it('also tells every other super-admin, and the security inbox even then', () =>
    withRollback(async (tx) => {
      const ada = await createStaffAccount(tx, { name: 'Ada Okafor' })
      const bola = await createSuperAdmin(tx, { name: 'Bola Ade' })
      const { code, mailer } = await run(tx, selfReset(ada.email), SECURITY)
      expect(code).toBe(0)
      expect(mailer.to(bola.email)[0]?.subject).toMatch(/ from the command line$/)
      expect(mailer.to(SECURITY)[0]?.subject).toBe(
        'Ada Okafor reset their own two-step from the command line',
      )
    }))

  it('is still refused in the console', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.resetTwoStep.apply({
          userId: ada.id,
          expected: {},
          reason: 'Lost phone',
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: "You can't reset your own two-step. Ask another super-admin.",
      })
    }))
})
