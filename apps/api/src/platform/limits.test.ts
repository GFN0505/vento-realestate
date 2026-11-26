import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, invitations, members } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  addAddOnRow,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
  createUser,
  setOverride,
  type TestOrg,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { planLimitMessage } from './limits'

const spv = (name: string) => ({ name, type: 'spv' as const })

/** A Starter organization (2 active entities, 10 people) already at its entity limit. */
async function starterAtEntityLimit(tx: DbOrTx): Promise<TestOrg> {
  const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
  await createEntity(tx, org, { name: 'Lekki Partners Holdings Ltd', type: 'holding' })
  await createEntity(tx, org, { name: 'Lekki Pearl SPV Ltd' })
  return org
}

async function auditCount(tx: DbOrTx, org: TestOrg, action: string) {
  const rows = await tx
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, action)))
  return rows.length
}

describe('plan limits: entities', () => {
  it('refuses a third active entity on Starter, telling the owner what to do', () =>
    withRollback(async (tx) => {
      const org = await starterAtEntityLimit(tx)
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await expect(client.entities.create(spv('Third SPV Ltd'))).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message:
          'Your Starter plan includes 2 active entities. Archive an entity or talk to Vento about Growth.',
        data: { reason: 'plan_limit', limit: 'entities', included: 2 },
      })
      expect(await auditCount(tx, org, 'entity.created')).toBe(0)
    }))

  it('tells other members who to ask, without the plan name', () =>
    withRollback(async (tx) => {
      const org = await starterAtEntityLimit(tx)
      const { user } = await createMember(tx, org, { role: 'admin', name: 'Ada Admin' })
      const { client } = clientAs(tx, user, { activeOrganizationId: org.id })
      const error = await client.entities.create(spv('Third SPV Ltd')).catch((e: unknown) => e)
      expect(error).toMatchObject({
        code: 'FORBIDDEN',
        message:
          'Your organization has reached its limit of 2 active entities. Ask Olumide Bankole (owner).',
        data: { reason: 'plan_limit', askName: 'Olumide Bankole', askRole: 'owner' },
      })
      expect(JSON.stringify(error)).not.toMatch(/Starter|Growth/)
    }))

  it("doesn't count archived entities", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await createEntity(tx, org, { name: 'Holding Ltd', type: 'holding' })
      await createEntity(tx, org, { status: 'archived', archivedAt: new Date() })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await expect(client.entities.create(spv('New SPV Ltd'))).resolves.toMatchObject({
        name: 'New SPV Ltd',
      })
    }))

  it('uses a negotiated limit, worded without the plan name', () =>
    withRollback(async (tx) => {
      const org = await starterAtEntityLimit(tx)
      await setOverride(tx, org, { kind: 'limit', key: 'entities', limitValue: '3.00' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await client.entities.create(spv('Third SPV Ltd'))
      await expect(client.entities.create(spv('Fourth SPV Ltd'))).rejects.toMatchObject({
        message:
          'Your plan includes 3 active entities. Archive an entity or talk to Vento about Growth.',
        data: { included: 3 },
      })
    }))

  it('lifts the limit with an unlimited override, for no plan, and for internal organizations', () =>
    withRollback(async (tx) => {
      const deal = await starterAtEntityLimit(tx)
      await setOverride(tx, deal, { kind: 'limit', key: 'entities', limitValue: null })
      const noPlan = await createOrganization(tx, { releaseGroup: 'standard' })
      const internal = await createOrganization(tx, { releaseGroup: 'internal' })
      for (const org of [deal, noPlan, internal]) {
        for (const name of ['A Ltd', 'B Ltd', 'C Ltd']) await createEntity(tx, org, { name })
        const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
        await expect(client.entities.create(spv('One More Ltd'))).resolves.toBeTruthy()
      }
    }))

  it('keeps everything working over the limit after a downgrade, refusing only creates', () =>
    withRollback(async (tx) => {
      const org = await starterAtEntityLimit(tx)
      const extra = await createEntity(tx, org, { name: 'From Growth Days Ltd' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      expect((await client.entities.list({})).total).toBe(3)
      await expect(
        client.entities.update({ id: extra.id, name: 'Renamed Ltd' }),
      ).resolves.toMatchObject({ name: 'Renamed Ltd' })
      await expect(client.entities.create(spv('Fourth Ltd'))).rejects.toMatchObject({
        data: { reason: 'plan_limit' },
      })
    }))
})

describe('plan limits: people', () => {
  async function starterWithPeople(tx: DbOrTx, members: number, invited: number) {
    const org = await createOrganization(tx, { planKey: 'starter' })
    for (let i = 1; i < members; i++) await createMember(tx, org, { role: 'viewer' })
    for (let i = 0; i < invited; i++) await createInvitation(tx, org, { role: 'viewer' })
    return org
  }
  const invite = (org: TestOrg, n: number) => ({
    items: Array.from({ length: n }, (_, i) => ({
      email: `new${i}@test.vento.ng`,
      roleId: org.roleIds.get('viewer') ?? '',
    })),
    entityIds: null,
  })

  it('refuses three invitations at 8 of 10, writing nothing and auditing nothing', () =>
    withRollback(async (tx) => {
      const org = await starterWithPeople(tx, 6, 2)
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await expect(client.invitations.create(invite(org, 3))).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message:
          'Your plan includes 10 people, and 8 are in or invited. Remove someone or talk to Vento about Growth.',
        data: { reason: 'plan_limit', limit: 'members', included: 10 },
      })
      const rows = await tx.select().from(invitations).where(eq(invitations.organizationId, org.id))
      expect(rows).toHaveLength(2)
      expect(await auditCount(tx, org, 'invitation.sent')).toBe(0)
    }))

  it("doesn't count expired invitations or removed members", () =>
    withRollback(async (tx) => {
      const org = await starterWithPeople(tx, 8, 0)
      await createInvitation(tx, org, { role: 'viewer', expiresAt: new Date(Date.now() - 1000) })
      const { member } = await createMember(tx, org, { role: 'viewer' })
      await tx
        .update(members)
        .set({ status: 'removed', removedAt: new Date() })
        .where(eq(members.id, member.id))
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await expect(client.invitations.create(invite(org, 2))).resolves.toMatchObject({ sent: 2 })
    }))

  it('refuses bringing back an expired invitation when there is no place left', () =>
    withRollback(async (tx) => {
      const org = await starterWithPeople(tx, 10, 0)
      const { invitation } = await createInvitation(tx, org, {
        role: 'viewer',
        expiresAt: new Date(Date.now() - 1000),
      })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await expect(client.invitations.resend({ id: invitation.id })).rejects.toMatchObject({
        data: { reason: 'plan_limit', limit: 'members' },
      })
    }))
})

describe('plan limits: accepting an invitation', () => {
  it('refuses to add a person while the organization is over its people limit after a downgrade', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      for (let i = 1; i < 10; i++) await createMember(tx, org, { role: 'viewer' })
      const invitee = await createUser(tx, { name: 'Chidi Okafor' })
      const { token } = await createInvitation(tx, org, { role: 'viewer', email: invitee.email })
      await createInvitation(tx, org, { role: 'viewer' })
      const { client } = clientAs(tx, invitee)
      await expect(client.invitations.accept({ token })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'plan_limit', limit: 'members', included: 10 },
      })
      const rows = await tx.select().from(members).where(eq(members.userId, invitee.id))
      expect(rows).toEqual([])
    }))

  it('lets the invitee join when their invitation is within the limit', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      for (let i = 1; i < 9; i++) await createMember(tx, org, { role: 'viewer' })
      const invitee = await createUser(tx, { name: 'Chidi Okafor' })
      const { token } = await createInvitation(tx, org, { role: 'viewer', email: invitee.email })
      const { client } = clientAs(tx, invitee)
      await expect(client.invitations.accept({ token })).resolves.toBeTruthy()
    }))
})

describe('planLimitMessage', () => {
  it('leaves out "about …" when no higher plan has more', () => {
    expect(
      planLimitMessage({
        key: 'projects',
        included: 1,
        used: 1,
        isOwner: true,
        planName: 'Starter',
        higherPlanName: null,
        ownerName: null,
      }),
    ).toBe('Your Starter plan includes 1 active project. Archive a project or talk to Vento.')
  })
})

describe('add-ons and limits', () => {
  it('raises the AI budget with the add-on, which is unlimited only for internal organizations', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await addAddOnRow(tx, org, { budget: '150000.00' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const me = await client.account.me()
      expect(me.plan?.aiBudget).toBe('150000.00')
      // Released only to internal organizations so far, so not available yet.
      expect(me.features.map((f) => f.key)).not.toContain('ai.ask')
    }))
})
