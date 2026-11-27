import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, members, organizations, passkeys, sessions } from '@/db/schema'
import { countingDb } from '@/test/counting-db'
import { withRollback } from '@/test/db'
import {
  createInvitation,
  createMember,
  createOrganization,
  createSession,
  createUser,
  type TestOrg,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'

const owner = (tx: DbOrTx, org: TestOrg) =>
  clientAs(tx, org.owner, { activeOrganizationId: org.id })

async function addPasskeyRow(tx: DbOrTx, user: TestUser) {
  await tx.insert(passkeys).values({
    userId: user.id,
    name: 'iCloud Keychain · iPhone',
    publicKey: 'not-a-real-key',
    credentialID: `cred-${user.id}`,
    counter: 0,
    deviceType: 'multiDevice',
    backedUp: true,
  })
}

describe('organization.security', () => {
  it('counts active members with two-step and names the first three without', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      for (const name of ['Kunle Ojo', 'Grace Umeh', 'Femi Adeoye', 'Zainab Musa']) {
        await createMember(tx, org, { role: 'sales', name })
      }
      const { member: gone } = await createMember(tx, org, { role: 'sales', name: 'Ada Removed' })
      await tx
        .update(members)
        .set({ status: 'removed', removedAt: new Date() })
        .where(eq(members.id, gone.id))
      await createInvitation(tx, org, { role: 'sales' })
      const security = await owner(tx, org).client.organization.security()
      expect(security).toMatchObject({
        required: false,
        changedAt: null,
        withTwoStep: 1,
        people: 5,
        withoutTwoStep: { names: ['Femi Adeoye', 'Grace Umeh', 'Kunle Ojo'], others: 1 },
        canChange: true,
      })
    }))

  it('is read-only for an admin', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'admin' })
      const { client } = clientAs(tx, user, { activeOrganizationId: org.id })
      expect((await client.organization.security()).canChange).toBe(false)
    }))

  it("never counts another organization's people", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const other = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      await createMember(tx, other, { role: 'sales' })
      expect((await owner(tx, org).client.organization.security()).people).toBe(1)
    }))
})

describe('organization.setTwoStepRequired', () => {
  it('lets an owner turn it on, audited, with no email', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { client, mailer } = owner(tx, org)
      const result = await client.organization.setTwoStepRequired({
        required: true,
        seenChangedAt: null,
      })
      expect(result).toMatchObject({
        required: true,
        changedByName: 'Olumide Bankole',
        notice: 'Two-step is now required for everyone in Vento Homes Ltd',
        changedByOther: null,
      })
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'organization.updated'),
          ),
        )
      expect(event).toMatchObject({
        before: { twoStepRequiredForEveryone: false },
        after: { twoStepRequiredForEveryone: true },
      })
      expect(mailer.messages).toHaveLength(0)
    }))

  it('emails every active owner when it is turned off', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user: second } = await createMember(tx, org, { role: 'owner' })
      const { client, mailer } = owner(tx, org)
      await client.organization.setTwoStepRequired({ required: true, seenChangedAt: null })
      await client.organization.setTwoStepRequired({ required: false, seenChangedAt: null })
      const subject =
        'Vento Real Estate: two-step is no longer required for everyone in Vento Homes Ltd'
      expect(mailer.to(org.owner.email).at(-1)?.subject).toBe(subject)
      expect(mailer.to(second.email).at(-1)?.subject).toBe(subject)
    }))

  it('refuses an admin with "Only owners can change this." and writes nothing', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'admin' })
      const { db, calls } = countingDb(tx)
      const { client } = clientAs(db, user, { activeOrganizationId: org.id })
      await expect(
        client.organization.setTwoStepRequired({ required: true, seenChangedAt: null }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only owners can change this.',
        data: { reason: 'owner_only' },
      })
      const [row] = await tx.select().from(organizations).where(eq(organizations.id, org.id))
      expect(row?.twoStepRequiredForEveryone).toBe(false)
      expect(calls.filter((c) => c === 'update' || c === 'insert')).toEqual([])
    }))

  it('tells an owner when someone else already changed it', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user: bisi } = await createMember(tx, org, { role: 'owner', name: 'Bisi Lawal' })
      await clientAs(tx, bisi, {
        activeOrganizationId: org.id,
      }).client.organization.setTwoStepRequired({
        required: true,
        seenChangedAt: null,
      })
      const again = await owner(tx, org).client.organization.setTwoStepRequired({
        required: true,
        seenChangedAt: null,
      })
      expect(again.changedByOther).toBe('Bisi Lawal changed this a moment ago.')
    }))

  it('refuses a tab showing another organization', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const other = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      const { client } = clientAs(tx, org.owner, {
        activeOrganizationId: org.id,
        expectedOrganizationId: other.id,
      })
      await expect(
        client.organization.setTwoStepRequired({ required: true, seenChangedAt: null }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'organization_changed' } })
    }))
})

describe('the setting elsewhere (team, roles, invitations)', () => {
  it('shows people without two-step as "set up at next sign-in" and every role as required', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'sales' })
      await owner(tx, org).client.organization.setTwoStepRequired({
        required: true,
        seenChangedAt: null,
      })
      const { client } = owner(tx, org)
      const team = await client.team.list({})
      const row = team.items.find((r) => r.kind === 'member' && r.userId === user.id)
      expect(row).toMatchObject({ twoStep: 'setup_required', passkeyCount: 0 })
      expect((await client.roles.list()).requiredForEveryone).toBe(true)
      const sales = org.roleIds.get('sales') ?? ''
      expect(await client.roles.get({ id: sales })).toMatchObject({
        requiresTwoStep: false,
        requiredForEveryone: true,
      })
    }))

  it('says two-step is required on the invitation', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await tx
        .update(organizations)
        .set({ twoStepRequiredForEveryone: true, twoStepRequiredChangedAt: new Date() })
        .where(eq(organizations.id, org.id))
      const { token } = await createInvitation(tx, org, { role: 'sales' })
      const { client } = clientAs(tx, null)
      expect((await client.invitations.preview({ token })).twoStepRequired).toBe(true)
    }))
})

describe('reset two-step and passkeys', () => {
  it('offers reset for a member with a passkey and two-step off, and counts their passkeys', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'sales' })
      await addPasskeyRow(tx, user)
      const team = await owner(tx, org).client.team.list({})
      const row = team.items.find((r) => r.kind === 'member' && r.userId === user.id)
      expect(row).toMatchObject({ twoStep: 'off', passkeyCount: 1, can: { resetTwoStep: true } })
    }))

  it('deletes every passkey with the sessions, recording how many', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user, member } = await createMember(tx, org, { role: 'sales' })
      await addPasskeyRow(tx, user)
      await createSession(tx, user)
      const { client } = clientAs(tx, org.owner, {
        activeOrganizationId: org.id,
        authApi: { requestPasswordReset: async () => ({ status: true }) },
      })
      await client.members.resetTwoStep({ memberId: member.id })
      expect(await tx.select().from(passkeys).where(eq(passkeys.userId, user.id))).toEqual([])
      expect(await tx.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([])
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.targetId, user.id), eq(auditEvents.action, 'two_step.reset')))
      expect(event?.metadata).toMatchObject({ passkeysRemoved: 1, sessionsEnded: 1 })
    }))
})

describe('the passkey limit in the database', () => {
  it('refuses an 11th passkey even when the app check is bypassed', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      const row = (i: number) => ({
        userId: user.id,
        publicKey: 'x',
        credentialID: `cred-limit-${user.id}-${i}`,
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
      })
      await tx.insert(passkeys).values(Array.from({ length: 10 }, (_, i) => row(i)))
      await expect(tx.insert(passkeys).values(row(10))).rejects.toMatchObject({
        cause: { message: 'PASSKEY_LIMIT' },
      })
    }))
})
