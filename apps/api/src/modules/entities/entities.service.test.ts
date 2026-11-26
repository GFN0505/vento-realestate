import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { loadMembership } from '@/access/context'
import { db } from '@/db/client'
import { auditEvents, entities } from '@/db/schema'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  archiveEntityRow,
  contextFor,
  createEntity,
  createMember,
  createOrganization,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import {
  archiveEntity,
  archivePreview,
  createEntity as create,
  getEntity,
  listEntities,
  restoreEntity,
  updateEntity,
} from './entities.service'

const RANDOM_ID = '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f'
const spv = { type: 'spv' as const, tin: null, vatRegistered: false }

describe('entities', () => {
  it('refuses an RC number another entity already uses, naming it', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org, { name: 'Parkview Residences SPV Ltd', rcNumber: 'RC 1789234' })
      const ctx = await contextFor(tx, org.owner, org)
      await expect(
        create(ctx, { ...spv, name: 'Lekki Pearl Estates Ltd', rcNumber: 'rc-1789234' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Parkview Residences SPV Ltd already uses RC 1789234.',
      })
    }))

  it('saves odd-looking RC numbers and TINs (warnings never block)', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ctx = await contextFor(tx, org.owner, org)
      const entity = await create(ctx, { ...spv, name: 'Odd Ltd', rcNumber: 'X-1', tin: '12AB' })
      expect(entity).toMatchObject({ rcNumber: 'X 1', tin: '12AB' })
    }))

  it('shows a limited member only their entities; others are not found, like a random id', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org, { name: 'Parkview Residences SPV Ltd' })
      const victoria = await createEntity(tx, org, {
        name: 'Victoria Gardens Dev. Ltd',
        type: 'holding',
      })
      const kunle = await createMember(tx, org, {
        role: 'project_manager',
        entityIds: [parkview.id],
      })
      const ctx = await contextFor(tx, kunle.user, org)
      const list = await listEntities(ctx, { page: 1, pageSize: 25 })
      expect(list.items.map((e) => e.name)).toEqual(['Parkview Residences SPV Ltd'])
      expect(list.total).toBe(1)
      await expect(getEntity(ctx, victoria.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(getEntity(ctx, RANDOM_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('counts members who can only see the entity before archiving it', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      await createMember(tx, org, { role: 'project_manager', entityIds: [parkview.id] })
      await createMember(tx, org, { role: 'facility', entityIds: [parkview.id] })
      await createMember(tx, org, { role: 'sales', entityIds: [parkview.id, lekki.id] })
      const ctx = await contextFor(tx, org.owner, org)
      expect(await archivePreview(ctx, parkview.id)).toEqual({
        isLastActive: false,
        members: { count: 2, names: ['facility person', 'project_manager person'] },
      })
      const archived = await archiveEntity(ctx, parkview.id)
      expect(archived.status).toBe('archived')
      expect(await archivePreview(ctx, lekki.id)).toEqual({
        isLastActive: true,
        members: { count: 1, names: ['sales person'] },
      })
    }))

  it("won't archive the last active entity", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const only = await createEntity(tx, org)
      const ctx = await contextFor(tx, org.owner, org)
      await expect(archiveEntity(ctx, only.id)).rejects.toMatchObject({
        data: { reason: 'last_entity' },
      })
    }))

  it('records before and after when an entity is edited', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const entity = await createEntity(tx, org)
      const ctx = await contextFor(tx, org.owner, org)
      const updated = await updateEntity(ctx, {
        id: entity.id,
        vatRegistered: true,
        tin: '1234567890',
      })
      expect(updated).toMatchObject({ vatRegistered: true, tin: '1234567890' })
    }))

  it('searches by name or RC number, treating % as a character, with chip counts', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org, { name: 'Parkview Residences SPV Ltd', rcNumber: 'RC 1789234' })
      await createEntity(tx, org, { name: '100% Homes Ltd', type: 'holding' })
      const old = await createEntity(tx, org, { name: 'Ikoyi Crest SPV Ltd' })
      await archiveEntityRow(tx, old, org.owner)
      const ctx = await contextFor(tx, org.owner, org)
      const page = (q: string) => listEntities(ctx, { page: 1, pageSize: 25, q })
      expect((await page('1789')).items.map((e) => e.name)).toEqual(['Parkview Residences SPV Ltd'])
      expect((await page('%')).items.map((e) => e.name)).toEqual(['100% Homes Ltd'])
      const archived = await listEntities(ctx, { page: 1, pageSize: 25, status: 'archived' })
      expect(archived.items).toEqual([
        expect.objectContaining({ name: 'Ikoyi Crest SPV Ltd', archivedByName: 'Olumide Bankole' }),
      ])
      expect(archived.counts).toEqual({ active: 2, archived: 1 })
      expect(archived.total).toBe(1)
    }))

  it("counts only the companies within a limited viewer's access", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      const kunle = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const list = await listEntities(await contextFor(tx, kunle.user, org), {
        page: 1,
        pageSize: 25,
      })
      expect(list.counts).toEqual({ active: 1, archived: 0 })
    }))

  it('names an archived company holding the RC number, so it can be restored instead', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const lekki = await createEntity(tx, org, {
        name: 'Lekki Pearl Estates Ltd',
        rcNumber: 'RC 1904417',
      })
      await archiveEntityRow(tx, lekki, org.owner)
      const ctx = await contextFor(tx, org.owner, org)
      await expect(
        create(ctx, { ...spv, name: 'Lekki Pearl Two Ltd', rcNumber: '1904417' }),
      ).rejects.toMatchObject({
        data: {
          reason: 'rc_number_taken',
          entity: { id: lekki.id, name: 'Lekki Pearl Estates Ltd', archived: true },
        },
        message: 'Lekki Pearl Estates Ltd (archived) already uses RC 1904417.',
      })
    }))

  it("doesn't name a company outside a limited editor's access in an RC clash", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd', rcNumber: 'RC 1904417' })
      const kunle = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const ctx = await contextFor(tx, kunle.user, org)
      const refusal = await updateEntity(ctx, { id: parkview.id, rcNumber: 'RC 1904417' }).catch(
        (e: unknown) => e,
      )
      expect(refusal).toMatchObject({ message: 'Another company already uses RC 1904417.' })
      expect(JSON.stringify(refusal)).not.toContain('Lekki')
    }))

  it('keeps an archived company read-only until it is restored', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      await archiveEntityRow(tx, lekki)
      const ctx = await contextFor(tx, org.owner, org)
      await expect(updateEntity(ctx, { id: lekki.id, tin: '1234567890' })).rejects.toMatchObject({
        data: { reason: 'entity_archived' },
        message: 'Lekki Pearl Estates Ltd is archived. Restore it to make changes.',
      })
    }))

  it('records who archived it, and restoring clears that and is audited', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      const ctx = await contextFor(tx, org.owner, org)
      expect(await archiveEntity(ctx, lekki.id)).toMatchObject({
        status: 'archived',
        archivedByName: 'Olumide Bankole',
      })
      await expect(archiveEntity(ctx, lekki.id)).rejects.toMatchObject({
        data: { reason: 'not_archivable' },
        message: 'Lekki Pearl Estates Ltd is already archived. The list is up to date.',
      })
      expect(await restoreEntity(ctx, lekki.id)).toMatchObject({
        status: 'active',
        archivedAt: null,
        archivedByName: null,
      })
      const [row] = await tx.select().from(entities).where(eq(entities.id, lekki.id))
      expect(row?.archivedByUserId).toBeNull()
      const restored = await tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.targetId, lekki.id), eq(auditEvents.action, 'entity.restored')))
      expect(restored).toHaveLength(1)
      await expect(restoreEntity(ctx, lekki.id)).rejects.toMatchObject({
        data: { reason: 'not_restorable' },
        message: 'Lekki Pearl Estates Ltd is already active. The list is up to date.',
      })
    }))

  it('refuses archiving the last active company in the new words', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const only = await createEntity(tx, org)
      await expect(
        archiveEntity(await contextFor(tx, org.owner, org), only.id),
      ).rejects.toMatchObject({ message: 'Vento Homes Ltd needs at least one active company.' })
    }))

  it('checks the plan limit on restore, in words for the owner and for an admin', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await createEntity(tx, org, { name: 'Holding Ltd', type: 'holding' })
      await createEntity(tx, org)
      const old = await archiveEntityRow(tx, await createEntity(tx, org, { name: 'Old SPV Ltd' }))
      const admin = await createMember(tx, org, { role: 'admin' })
      await expect(
        restoreEntity(await contextFor(tx, org.owner, org), old.id),
      ).rejects.toMatchObject({
        data: { reason: 'plan_limit', limit: 'entities', included: 2 },
        message:
          'Your Starter plan includes 2 active companies. Archive one, or talk to Vento about Growth.',
      })
      await expect(
        restoreEntity(await contextFor(tx, admin.user, org), old.id),
      ).rejects.toMatchObject({
        message:
          'Your organization has reached its limit of 2 active companies. Ask Olumide Bankole (owner).',
      })
    }))

  it('keeps a member limited only to an archived company limited, never "all companies" (R1)', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      const old = await createEntity(tx, org, { name: 'Ikoyi Crest SPV Ltd' })
      const bayo = await createMember(tx, org, { role: 'sales', entityIds: [old.id] })
      await archiveEntity(await contextFor(tx, org.owner, org), old.id)
      const membership = await loadMembership(tx, bayo.user.id, org.id)
      expect(membership?.member.entityIds).toEqual([old.id])
      const visible = await listEntities(await contextFor(tx, bayo.user, org), {
        page: 1,
        pageSize: 25,
        status: 'active',
      })
      expect(visible.items).toEqual([])
    }))

  it('refuses adding, archiving and restoring to an admin limited to one company', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      const kunle = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const { client } = clientAs(tx, kunle.user)
      const refused = { code: 'FORBIDDEN', data: { reason: 'all_entities_required' } }
      await expect(client.entities.create({ name: 'New Ltd', type: 'spv' })).rejects.toMatchObject(
        refused,
      )
      await expect(client.entities.archive({ id: parkview.id })).rejects.toMatchObject(refused)
      await expect(client.entities.restore({ id: lekki.id })).rejects.toMatchObject(refused)
      await expect(
        client.entities.update({ id: parkview.id, tin: '1234567890' }),
      ).resolves.toMatchObject({ tin: '1234567890' })
    }))
})

// Real commits on separate connections: the only way to prove the locks serialise restores.
describe('restoring under concurrency', () => {
  it('lets exactly one of two simultaneous restores take the last company place', async () => {
    const org = await createOrganization(db, {
      name: `Race Restore ${uniqueEmail('org')}`,
      planKey: 'starter',
    })
    await createEntity(db, org, { name: 'Race Holding Ltd', type: 'holding' })
    const a = await archiveEntityRow(db, await createEntity(db, org, { name: 'Race A Ltd' }))
    const b = await archiveEntityRow(db, await createEntity(db, org, { name: 'Race B Ltd' }))
    const client = () => clientAs(db, org.owner, { activeOrganizationId: org.id }).client
    const results = await Promise.allSettled([
      client().entities.restore({ id: a.id }),
      client().entities.restore({ id: b.id }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refused = results.find((r) => r.status === 'rejected')
    expect(refused?.status === 'rejected' && refused.reason).toMatchObject({
      data: { reason: 'plan_limit' },
    })
  })
})
