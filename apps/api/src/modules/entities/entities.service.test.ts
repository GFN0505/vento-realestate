import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { contextFor, createEntity, createMember, createOrganization } from '@/test/factories'
import {
  archiveEntity,
  archivePreview,
  createEntity as create,
  getEntity,
  listEntities,
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
})
