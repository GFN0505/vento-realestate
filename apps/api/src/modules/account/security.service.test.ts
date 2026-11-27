import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, organizationPlans, passkeys, sessions, signInLocks, users } from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { createRateLimiter } from '@/lib/rate-limit'
import { countingDb } from '@/test/counting-db'
import { withRollback } from '@/test/db'
import {
  createMember,
  createOrganization,
  createSession,
  createUser,
  TEST_PASSWORD,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { confirmPassword } from './security.service'

async function addPasskeyRow(tx: DbOrTx, user: TestUser, name = 'iCloud Keychain · iPhone') {
  const [row] = await tx
    .insert(passkeys)
    .values({
      userId: user.id,
      name,
      publicKey: 'not-a-real-key',
      credentialID: `cred-${user.id}-${Math.random()}`,
      counter: 0,
      deviceType: 'multiDevice',
      backedUp: true,
    })
    .returning()
  if (!row) throw new Error('passkey insert failed')
  return row
}

async function salesPerson(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const user = await createUser(tx, { name: 'Grace Umeh', password: TEST_PASSWORD })
  await createMember(tx, org, { role: 'sales', user })
  const session = await createSession(tx, user, { activeOrganizationId: org.id })
  const { client, mailer } = clientAs(tx, user, {
    sessionId: session.id,
    activeOrganizationId: org.id,
  })
  return { org, user, session, client, mailer }
}

const audit = (tx: DbOrTx, userId: string, action: string) =>
  tx
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.action, action)))

describe('account.security', () => {
  it('shows two-step off, nothing required, the passkeys and "set when you joined"', () =>
    withRollback(async (tx) => {
      const { user, client } = await salesPerson(tx)
      await addPasskeyRow(tx, user)
      const security = await client.account.security()
      expect(security).toMatchObject({
        name: 'Grace Umeh',
        passwordChangedAt: null,
        twoStep: { enabled: false, requiredBy: null, backupCodesLeft: null },
        passkeys: { available: true, limit: 10 },
        reauthenticatedUntil: null,
      })
      expect(security.passkeys.items.map((p) => p.name)).toEqual(['iCloud Keychain · iPhone'])
    }))

  it('hides passkeys when they aren’t available to the organization', () =>
    withRollback(async (tx) => {
      const { org, user, client } = await salesPerson(tx)
      await addPasskeyRow(tx, user)
      await tx
        .update(organizationPlans)
        .set({ releaseGroup: 'standard' })
        .where(eq(organizationPlans.organizationId, org.id))
      const { passkeys: card } = await client.account.security()
      expect(card).toEqual({ available: false, items: [], limit: 10 })
    }))
})

describe('account.confirmPassword', () => {
  it('opens a 5-minute window on this session', () =>
    withRollback(async (tx) => {
      const { session, client } = await salesPerson(tx)
      const { reauthenticatedUntil } = await client.account.confirmPassword({
        password: TEST_PASSWORD,
      })
      expect(Date.parse(reauthenticatedUntil) - Date.now()).toBeGreaterThan(4 * 60_000)
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.reauthenticatedAt).not.toBeNull()
    }))

  it('refuses a wrong password and counts it towards the lock', () =>
    withRollback(async (tx) => {
      const { user, client } = await salesPerson(tx)
      await expect(
        client.account.confirmPassword({ password: 'Wrong-pass-123' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: "That's not your password.",
        data: { reason: 'wrong_password' },
      })
      const failed = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.targetId, user.id), eq(auditEvents.action, 'auth.sign_in_failed')),
        )
      expect(failed).toHaveLength(1)
    }))

  it('locks and emails at the 10th wrong password, then refuses even the right one', () =>
    withRollback(async (tx) => {
      const { user, session } = await salesPerson(tx)
      const mailer = createMemoryTransport()
      const deps = { db: tx, mailer, rateLimiter: createRateLimiter(false) }
      for (let i = 0; i < 9; i++) {
        await expect(confirmPassword(deps, user, session, 'Wrong-pass-123')).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        })
      }
      await expect(confirmPassword(deps, user, session, 'Wrong-pass-123')).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
      expect(mailer.to(user.email).at(-1)?.subject).toBe(
        'Vento Real Estate: sign-in locked for 15 minutes',
      )
      expect(
        await tx.select().from(signInLocks).where(eq(signInLocks.email, user.email)),
      ).toHaveLength(1)
      await expect(confirmPassword(deps, user, session, TEST_PASSWORD)).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
    }))

  it('allows 10 a minute per person', () =>
    withRollback(async (tx) => {
      const { user, session } = await salesPerson(tx)
      const deps = { db: tx, mailer: createMemoryTransport(), rateLimiter: createRateLimiter(true) }
      for (let i = 0; i < 10; i++) await confirmPassword(deps, user, session, TEST_PASSWORD)
      await expect(confirmPassword(deps, user, session, TEST_PASSWORD)).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
    }))
})

describe('account.updateName', () => {
  it('trims, saves and audits before → after in every organization', () =>
    withRollback(async (tx) => {
      const { user, client } = await salesPerson(tx)
      const other = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      await createMember(tx, other, { role: 'sales', user })
      const result = await client.account.updateName({ name: '  Grace Umeh-Obi ' })
      expect(result).toEqual({ name: 'Grace Umeh-Obi', notice: 'Name updated' })
      const [row] = await tx.select({ name: users.name }).from(users).where(eq(users.id, user.id))
      expect(row?.name).toBe('Grace Umeh-Obi')
      const events = await audit(tx, user.id, 'account.name_changed')
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        before: { name: 'Grace Umeh' },
        after: { name: 'Grace Umeh-Obi' },
      })
    }))

  it('refuses hidden characters and writes nothing for the same name', () =>
    withRollback(async (tx) => {
      const { user, client } = await salesPerson(tx)
      await expect(client.account.updateName({ name: 'Grace‮Umeh' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      await client.account.updateName({ name: 'Grace Umeh' })
      expect(await audit(tx, user.id, 'account.name_changed')).toEqual([])
    }))
})

describe('account.passkeys', () => {
  it('renames and removes your own, audited with the name only, and emails on remove', () =>
    withRollback(async (tx) => {
      const { user, client, mailer } = await salesPerson(tx)
      const key = await addPasskeyRow(tx, user)
      await expect(
        client.account.passkeys.rename({ id: key.id, name: 'Work iPhone' }),
      ).resolves.toEqual({
        notice: 'Passkey renamed',
      })
      await expect(client.account.passkeys.remove({ id: key.id })).resolves.toEqual({
        notice: 'Passkey removed',
      })
      expect(await tx.select().from(passkeys).where(eq(passkeys.userId, user.id))).toEqual([])
      const [removed] = await audit(tx, user.id, 'passkey.removed')
      expect(removed).toMatchObject({ targetType: 'passkey', targetLabel: 'Work iPhone' })
      expect(JSON.stringify(removed)).not.toContain(key.credentialID)
      expect(mailer.to(user.email).at(-1)?.subject).toBe(
        'Vento Real Estate: a passkey was removed from your account',
      )
    }))

  it("answers not found for someone else's passkey and writes nothing", () =>
    withRollback(async (tx) => {
      const { org, user } = await salesPerson(tx)
      const tunde = await createUser(tx, { name: 'Tunde Ola' })
      const theirs = await addPasskeyRow(tx, tunde)
      const { db, calls } = countingDb(tx)
      const { client } = clientAs(db, user, { activeOrganizationId: org.id })
      await expect(
        client.account.passkeys.rename({ id: theirs.id, name: 'Mine' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      await expect(client.account.passkeys.remove({ id: theirs.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'That passkey was already removed. The list is up to date.',
      })
      expect(calls.filter((c) => c === 'insert' || c === 'update')).toEqual([])
      expect(await tx.select().from(passkeys).where(eq(passkeys.id, theirs.id))).toHaveLength(1)
    }))

  it('refuses rename when passkeys are unavailable here, but still lets you remove', () =>
    withRollback(async (tx) => {
      const { org, user, client } = await salesPerson(tx)
      const key = await addPasskeyRow(tx, user)
      await tx
        .update(organizationPlans)
        .set({ releaseGroup: 'standard' })
        .where(eq(organizationPlans.organizationId, org.id))
      await expect(client.account.passkeys.rename({ id: key.id, name: 'X' })).rejects.toMatchObject(
        {
          code: 'NOT_FOUND',
        },
      )
      await expect(client.account.passkeys.remove({ id: key.id })).resolves.toBeDefined()
    }))
})

describe('account.sessions', () => {
  it('shows the place and says why when a device is already signed out', () =>
    withRollback(async (tx) => {
      const { user, client } = await salesPerson(tx)
      await createSession(tx, user, { place: 'Lekki, Lagos', ipAddress: '102.89.34.x' })
      const list = await client.account.sessions.list({ page: 1, pageSize: 50 })
      expect(list.items.map((s) => s.place)).toContain('Lekki, Lagos')
      await expect(
        client.account.sessions.revoke({ id: '01936f1e-8b2a-7c3d-9e4f-0000000000aa' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'That device is already signed out. The list is up to date.',
      })
    }))
})
