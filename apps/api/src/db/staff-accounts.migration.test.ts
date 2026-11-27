import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  members,
  platformAdmins,
  platformAuditEvents,
  sessions,
  twoFactors,
  users,
} from '@/db/schema'
import { withRollback } from '@/test/db'
import { createOrganization, createSession, createUser, TEST_PASSWORD } from '@/test/factories'

// Migration 0014's deploy step (admin-console plan §1b.3): its data statements, run on the state
// they were written for (a super-admin on a customer account, possible before 1b). The guards
// that now forbid that state are switched off to build it, inside a rolled-back transaction, and
// while the statements run (in the migration they're created after them).

const file = resolve(import.meta.dirname, '../../drizzle/0014_staff_account_guards.sql')
const statements = readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
const dataSteps = statements.filter((s) => !/CREATE (FUNCTION|TRIGGER)/.test(s))

/**
 * Triggers off for this transaction only (no table lock, unlike ALTER TABLE … DISABLE TRIGGER,
 * which would block parallel test files). Needs a superuser, as the test databases have.
 */
async function withoutGuards(tx: DbOrTx, fn: () => Promise<unknown>) {
  await tx.execute(sql`set local session_replication_role = replica`)
  await fn()
  await tx.execute(sql`set local session_replication_role = origin`)
}

async function legacySuperAdmin(tx: DbOrTx, name: string) {
  const user = await createUser(tx, { name, twoFactorEnabled: true, password: TEST_PASSWORD })
  await withoutGuards(tx, () =>
    tx.insert(platformAdmins).values({ userId: user.id, reason: 'Before 1b' }),
  )
  await tx.insert(twoFactors).values({ userId: user.id, secret: 'x', backupCodes: 'x' })
  return user
}

async function runDataSteps(tx: DbOrTx) {
  await withoutGuards(tx, async () => {
    for (const step of dataSteps) await tx.execute(sql.raw(step))
  })
}

describe('migration 0014 at deploy', () => {
  it('has the three data steps before the guards', () => {
    expect(dataSteps).toHaveLength(3)
    expect(statements.length).toBeGreaterThan(dataSteps.length)
  })

  it('revokes a super-admin who is a member, with a platform event, and leaves their customer access', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ada = await legacySuperAdmin(tx, 'Ada Okafor')
      await tx.insert(members).values({
        organizationId: org.id,
        userId: ada.id,
        roleId: org.roleIds.get('viewer') ?? '',
      })
      const session = await createSession(tx, ada, { consoleOpenedAt: new Date() })
      await runDataSteps(tx)
      const [admin] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, ada.id))
      expect(admin?.revokedAt).toBeInstanceOf(Date)
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.targetKey, ada.id),
            eq(platformAuditEvents.action, 'superadmin.revoked'),
          ),
        )
      expect(event).toMatchObject({
        actorName: 'Vento Real Estate (setup)',
        actorUserId: null,
        channel: 'command',
        reason: 'Staff accounts are separate from customer accounts',
      })
      const [user] = await tx.select().from(users).where(eq(users.id, ada.id))
      expect(user).toMatchObject({ accountKind: 'customer', twoFactorEnabled: true })
      expect(await tx.select().from(accounts).where(eq(accounts.userId, ada.id))).toHaveLength(1)
      expect(await tx.select().from(twoFactors).where(eq(twoFactors.userId, ada.id))).toHaveLength(
        1,
      )
      const [member] = await tx.select().from(members).where(eq(members.userId, ada.id))
      expect(member?.status).toBe('active')
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.consoleOpenedAt).toBeNull()
    }))

  it('makes a super-admin with no membership a staff account', () =>
    withRollback(async (tx) => {
      const tunde = await legacySuperAdmin(tx, 'Tunde Bello')
      await runDataSteps(tx)
      const [user] = await tx.select().from(users).where(eq(users.id, tunde.id))
      expect(user?.accountKind).toBe('staff')
      const [admin] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, tunde.id))
      expect(admin?.revokedAt).toBeNull()
    }))
})
