import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { members, sessions } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  createEntity,
  createMember,
  createOrganization,
  createSession,
  createUser,
  reloadUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'

describe('account.me nextStep', () => {
  it('sends only the owner to finish setup when there is no entity yet', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const viewer = await createMember(tx, org, { role: 'viewer' })
      const finance = await createMember(tx, org, { role: 'finance' })
      expect((await clientAs(tx, org.owner).client.account.me()).nextStep).toBe('onboarding_entity')
      expect((await clientAs(tx, viewer.user).client.account.me()).nextStep).toBe('ready')
      const withoutTwoStep = { ...finance.user, twoFactorEnabled: false }
      expect((await clientAs(tx, withoutTwoStep).client.account.me()).nextStep).toBe(
        'two_step_setup',
      )
    }))

  it('sends the owner on once the first entity exists', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      expect((await clientAs(tx, org.owner).client.account.me()).nextStep).toBe('ready')
    }))
})

describe('account.me organizations', () => {
  it('lists active memberships only, with role names, by organization name', () =>
    withRollback(async (tx) => {
      const vento = await createOrganization(tx, { name: 'Vento Homes Ltd' })
      const tunde = await createMember(tx, vento, { role: 'finance', name: 'Tunde Ola' })
      const lekki = await createOrganization(tx, { name: 'Lekki Partners Ltd', owner: tunde.user })
      const gone = await createOrganization(tx, { name: 'Abuja Gardens Ltd' })
      const removed = await createMember(tx, gone, { role: 'viewer', user: tunde.user })
      await tx
        .update(members)
        .set({ status: 'removed', removedAt: new Date() })
        .where(eq(members.id, removed.member.id))

      const me = await clientAs(tx, tunde.user, {
        activeOrganizationId: vento.id,
      }).client.account.me()

      expect(me.organization?.id).toBe(vento.id)
      expect(me.organizations).toEqual([
        { id: lekki.id, name: 'Lekki Partners Ltd', roleName: 'Owner' },
        { id: vento.id, name: 'Vento Homes Ltd', roleName: 'Finance' },
      ])
    }))

  it('is empty for someone with no organization', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      expect((await clientAs(tx, user).client.account.me()).organizations).toEqual([])
    }))
})

describe('account.switchOrganization', () => {
  async function twoOrganizations(tx: DbOrTx) {
    const vento = await createOrganization(tx, { name: 'Vento Homes Ltd' })
    await createEntity(tx, vento)
    const tunde = await createMember(tx, vento, { role: 'finance', name: 'Tunde Ola' })
    const lekki = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
    await createEntity(tx, lekki)
    await createMember(tx, lekki, { role: 'sales', user: tunde.user })
    const session = await createSession(tx, tunde.user, { activeOrganizationId: vento.id })
    const { client } = clientAs(tx, tunde.user, {
      sessionId: session.id,
      activeOrganizationId: vento.id,
    })
    return { vento, lekki, tunde, session, client }
  }

  async function activeOrganizations(tx: DbOrTx, sessionId: string, userId: string) {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId))
    const user = await reloadUser(tx, userId)
    return { session: session?.activeOrganizationId, user: user?.lastActiveOrganizationId }
  }

  it('makes the organization active for this session and the next sign-in', () =>
    withRollback(async (tx) => {
      const { lekki, tunde, session, client } = await twoOrganizations(tx)

      const result = await client.account.switchOrganization({ organizationId: lekki.id })

      expect(result).toEqual({
        organization: { id: lekki.id, name: 'Lekki Partners Ltd' },
        nextStep: 'ready',
      })
      expect(await activeOrganizations(tx, session.id, tunde.user.id)).toEqual({
        session: lekki.id,
        user: lekki.id,
      })
    }))

  it('answers not found for an organization they left, never joined or that does not exist', () =>
    withRollback(async (tx) => {
      const { vento, lekki, tunde, session, client } = await twoOrganizations(tx)
      const stranger = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await tx
        .update(members)
        .set({ status: 'removed', removedAt: new Date() })
        .where(and(eq(members.userId, tunde.user.id), eq(members.organizationId, lekki.id)))

      for (const organizationId of [
        lekki.id,
        stranger.id,
        '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f',
      ]) {
        await expect(client.account.switchOrganization({ organizationId })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
      }
      expect((await activeOrganizations(tx, session.id, tunde.user.id)).session).toBe(vento.id)
    }))

  it('sends them to two-step setup when the new role needs it', () =>
    withRollback(async (tx) => {
      const vento = await createOrganization(tx)
      const tunde = await createMember(tx, vento, { role: 'viewer', name: 'Tunde Ola' })
      const lekki = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      await createEntity(tx, lekki)
      await createMember(tx, lekki, { role: 'finance', user: tunde.user })
      const { client } = clientAs(tx, tunde.user, { activeOrganizationId: vento.id })

      const result = await client.account.switchOrganization({ organizationId: lekki.id })

      expect(result.nextStep).toBe('two_step_setup')
    }))

  it('returns the current organization unchanged when asked to switch to it', () =>
    withRollback(async (tx) => {
      const { vento, tunde, session, client } = await twoOrganizations(tx)

      const result = await client.account.switchOrganization({ organizationId: vento.id })

      expect(result.organization).toEqual({ id: vento.id, name: 'Vento Homes Ltd' })
      // Nothing written: the person's default for the next sign-in is untouched.
      expect(await activeOrganizations(tx, session.id, tunde.user.id)).toEqual({
        session: vento.id,
        user: null,
      })
    }))
})
