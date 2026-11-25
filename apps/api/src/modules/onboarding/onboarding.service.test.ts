import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents, members, organizations, roles } from '@/db/schema'
import { withRollback } from '@/test/db'
import { contextFor, createUser } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { createFirstEntity, createOrganization } from './onboarding.service'

const input = {
  name: 'Vento Homes Ltd',
  headOfficeState: 'Lagos' as const,
  financialYearStartMonth: 1,
}

describe('onboarding', () => {
  it('creates the organization, nine roles and the owner together, with an audit event', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      const org = await createOrganization(tx, { user, sessionId: null }, input)
      expect(await tx.select().from(roles).where(eq(roles.organizationId, org.id))).toHaveLength(9)
      const [owner] = await tx.select().from(members).where(eq(members.organizationId, org.id))
      expect(owner?.userId).toBe(user.id)
      const events = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.organizationId, org.id))
      expect(events.map((e) => e.action)).toEqual(['organization.created'])
    }))

  it('leaves nothing behind when a step fails', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      const name = `Atomic Test ${Date.now()}`
      // A missing user makes the owner insert fail after the organization insert.
      const ghost = { ...user, id: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f' }
      await expect(
        tx.transaction((inner) =>
          createOrganization(inner, { user: ghost, sessionId: null }, { ...input, name }),
        ),
      ).rejects.toThrow()
      expect(
        await tx.select().from(organizations).where(eq(organizations.name, name)),
      ).toHaveLength(0)
    }))

  it('refuses a second organization', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      await createOrganization(tx, { user, sessionId: null }, input)
      await expect(createOrganization(tx, { user, sessionId: null }, input)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'already_onboarded' },
      })
    }))

  it('resumes at the entity step and creates the first entity only once', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx, { twoFactorEnabled: true })
      const org = await createOrganization(tx, { user, sessionId: null }, input)
      const { client } = clientAs(tx, user)
      expect((await client.account.me()).nextStep).toBe('onboarding_entity')
      const ctx = await contextFor(tx, user, org)
      const entity = await createFirstEntity(ctx, {
        name: 'Vento Homes Ltd',
        type: 'holding',
        rcNumber: 'ABC',
        tin: null,
        vatRegistered: false,
      })
      expect(entity.rcNumber).toBe('ABC')
      await expect(
        createFirstEntity(ctx, {
          name: 'Second',
          type: 'spv',
          rcNumber: null,
          tin: null,
          vatRegistered: false,
        }),
      ).rejects.toMatchObject({ data: { reason: 'already_onboarded' } })
      expect((await client.account.me()).nextStep).toBe('ready')
    }))
})
