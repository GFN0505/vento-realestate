import { and, count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, entities, members, sessions } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  createEntity,
  createMember,
  createOrganization,
  createSession,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { throwingDb } from '@/test/throwing-db'

/** Never stored: the database must not be reached for it. */
const offline = {
  id: '01936f1e-8b2a-7c3d-9e4f-000000000003',
  name: 'Tunde Ola',
  email: 'tunde@test.vento.ng',
  twoFactorEnabled: true,
} as TestUser

const organizationChanged = { code: 'CONFLICT', data: { reason: 'organization_changed' } }

async function tunde(tx: DbOrTx) {
  const vento = await createOrganization(tx, { name: 'Vento Homes Ltd' })
  await createEntity(tx, vento)
  const { user } = await createMember(tx, vento, { role: 'finance', name: 'Tunde Ola' })
  const lekki = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
  await createEntity(tx, lekki)
  await createMember(tx, lekki, { role: 'owner', user })
  return { vento, lekki, user }
}

async function rowCounts(tx: DbOrTx, organizationId: string) {
  const [e] = await tx
    .select({ n: count() })
    .from(entities)
    .where(eq(entities.organizationId, organizationId))
  const [a] = await tx
    .select({ n: count() })
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, organizationId))
  return { entities: e?.n, audit: a?.n }
}

describe('organization guard (tab header)', () => {
  it('lets a request through when the tab names the session organization', () =>
    withRollback(async (tx) => {
      const { vento, user } = await tunde(tx)
      const { client } = clientAs(tx, user, {
        activeOrganizationId: vento.id,
        expectedOrganizationId: vento.id,
      })
      expect((await client.entities.list({})).total).toBe(1)
    }))

  it('keeps the old behaviour when no header is sent', () =>
    withRollback(async (tx) => {
      const { vento, user } = await tunde(tx)
      const { client } = clientAs(tx, user, { activeOrganizationId: vento.id })
      expect((await client.entities.list({})).total).toBe(1)
    }))

  it('refuses a stale tab before touching the database', async () => {
    const vento = '01936f1e-8b2a-7c3d-9e4f-000000000001'
    const lekki = '01936f1e-8b2a-7c3d-9e4f-000000000002'
    const { client } = clientAs(throwingDb(), offline, {
      activeOrganizationId: lekki,
      expectedOrganizationId: vento,
    })
    await expect(client.entities.list({})).rejects.toMatchObject(organizationChanged)
  })

  it('refuses a malformed header', async () => {
    const { client } = clientAs(throwingDb(), offline, {
      activeOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000002',
      expectedOrganizationId: 'vento-homes',
    })
    await expect(client.entities.list({})).rejects.toMatchObject(organizationChanged)
  })

  it('writes nothing when a stale tab tries to add an entity', () =>
    withRollback(async (tx) => {
      const { vento, lekki, user } = await tunde(tx)
      const before = await rowCounts(tx, lekki.id)
      const { client } = clientAs(tx, user, {
        activeOrganizationId: lekki.id,
        expectedOrganizationId: vento.id,
      })

      await expect(
        client.entities.create({ name: 'Ikoyi Towers SPV Ltd', type: 'spv' }),
      ).rejects.toMatchObject(organizationChanged)

      expect(await rowCounts(tx, lekki.id)).toEqual(before)
      expect((await rowCounts(tx, vento.id)).entities).toBe(1)
    }))

  it('refuses, without moving the session, when the tab organization removed the person', () =>
    withRollback(async (tx) => {
      const { vento, user } = await tunde(tx)
      await tx
        .update(members)
        .set({ status: 'removed', removedAt: new Date() })
        .where(and(eq(members.userId, user.id), eq(members.organizationId, vento.id)))
      const session = await createSession(tx, user, { activeOrganizationId: vento.id })
      const { client } = clientAs(tx, user, {
        sessionId: session.id,
        activeOrganizationId: vento.id,
        expectedOrganizationId: vento.id,
      })

      await expect(client.entities.list({})).rejects.toMatchObject(organizationChanged)

      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.activeOrganizationId).toBe(vento.id)
    }))

  it('also guards onboarding procedures that run before two-step setup', async () => {
    const { client } = clientAs(throwingDb(), offline, {
      activeOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000002',
      expectedOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000001',
    })
    await expect(
      client.onboarding.createFirstEntity({ name: 'Vento Homes Ltd', type: 'holding' }),
    ).rejects.toMatchObject(organizationChanged)
  })
})
