import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  archiveEntityRow,
  createEntity,
  createMember,
  createParcel,
  createTitleDocument,
} from '@/test/factories'
import { addParcel, landWorld } from './land.test-world'

describe('land.parcels.update', () => {
  it('changes only the fields sent, bumps the version and audits before and after', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      const updated = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: parcel.version,
        name: 'Plot 22A, Folu Ayo',
        acquisitionCost: '840000000',
      })
      expect(updated).toMatchObject({
        name: 'Plot 22A, Folu Ayo',
        version: parcel.version + 1,
        acquisition: { cost: '840000000.00', currency: 'NGN' },
        lga: 'Ibeju-Lekki',
      })
      const [event] = await tx
        .select({ before: auditEvents.before, after: auditEvents.after })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.targetId, parcel.id), eq(auditEvents.action, 'land.parcel.updated')),
        )
      expect(event).toEqual({
        before: { name: 'Plot 22, Folu Ayo', acquisitionCost: null },
        after: { name: 'Plot 22A, Folu Ayo', acquisitionCost: '840000000.00' },
      })
    }))

  it('refuses a stale version and names who saved it', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      const owner = w.as(w.org.owner)
      await owner.land.parcels.update({
        id: parcel.id,
        expectedVersion: parcel.version,
        notes: 'Fenced',
      })
      await expect(
        w.client.land.parcels.update({
          id: parcel.id,
          expectedVersion: parcel.version,
          notes: 'Beacons',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stale', changedByName: 'Olumide Bankole' },
        message:
          'Olumide Bankole changed this parcel a moment ago. Check the latest, then save again.',
      })
    }))

  it('refuses an LGA of another state with the spec copy', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      await expect(
        w.client.land.parcels.update({
          id: parcel.id,
          expectedVersion: parcel.version,
          state: 'FCT',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'lga_not_in_state' },
        message: 'Pick an LGA in FCT.',
      })
    }))

  it('moves a parcel to another company only with access to both', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const lekkiOnly = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.lekki.id],
      })
      await expect(
        w
          .as(lekkiOnly.user)
          .land.parcels.update({ id: parcel.id, expectedVersion: 1, entityId: w.parkview.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const parkviewOnly = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      await expect(
        w
          .as(parkviewOnly.user)
          .land.parcels.update({ id: parcel.id, expectedVersion: 1, entityId: w.parkview.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const moved = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: 1,
        entityId: w.parkview.id,
      })
      expect(moved.entity).toMatchObject({ id: w.parkview.id, name: 'Parkview Residences SPV Ltd' })
    }))

  it('titles an acquired parcel whose stages are all granted, and keeps titled when Acquired is chosen', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2025-01-10' }],
      })
      const titled = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: 1,
        status: 'acquired',
      })
      expect(titled.status).toBe('titled')
      const kept = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: titled.version,
        status: 'acquired',
      })
      expect(kept).toMatchObject({ status: 'titled', version: titled.version })
      const back = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: titled.version,
        status: 'prospect',
      })
      expect(back.status).toBe('prospect')
    }))

  it('never changes a status Projects or Sales set', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        status: 'in_development',
      })
      const updated = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: 1,
        status: 'prospect',
      })
      expect(updated.status).toBe('in_development')
    }))

  it('saves a size edit that reads the same in hectares (4.2 ha → 4.204 ha)', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      const updated = await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: parcel.version,
        size: { value: '4.204', unit: 'ha' },
      })
      expect(updated).toMatchObject({
        sizeSqm: '42040.00',
        sizeEntered: '4.2040',
        version: parcel.version + 1,
      })
      const [event] = await tx
        .select({ before: auditEvents.before, after: auditEvents.after })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.targetId, parcel.id), eq(auditEvents.action, 'land.parcel.updated')),
        )
      expect(event).toEqual({ before: { size: '4.2 ha' }, after: { size: '4.204 ha' } })
    }))
})

describe('land.parcels.archive and restore', () => {
  it('archives out of the list, keeps the parcel read-only by link with documents downloadable', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const { version } = await createTitleDocument(tx, w.org, parcel, {
        type: 'survey_plan',
        storage: w.storage,
      })
      const archived = await w.client.land.parcels.archive({ id: parcel.id })
      expect(archived.archivedAt).not.toBeNull()
      expect((await w.client.land.parcels.list({})).total).toBe(0)
      expect((await w.client.land.parcels.get({ id: parcel.id })).readOnly).toBe('archived')
      await expect(
        w.client.land.parcels.update({ id: parcel.id, expectedVersion: 1, notes: 'x' }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'parcel_archived' } })
      await expect(
        w.client.land.stages.update({
          id: parcel.stageOf('survey_plan').id,
          expectedVersion: 1,
          status: 'submitted',
          on: '2026-11-01',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'parcel_archived' } })
      const link = await w.client.land.documents.link({
        versionId: version.id,
        disposition: 'attachment',
      })
      expect(link.url).toContain(parcel.organizationId)
    }))

  it('restores, and answers an archive twice as it is', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await w.client.land.parcels.archive({ id: parcel.id })
      await w.client.land.parcels.archive({ id: parcel.id })
      const restored = await w.client.land.parcels.restore({ id: parcel.id })
      expect(restored.archivedAt).toBeNull()
      const events = await tx
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.targetId, parcel.id))
      expect(events.map((e) => e.action).sort()).toEqual([
        'land.parcel.archived',
        'land.parcel.restored',
      ])
    }))

  it('makes a parcel of an archived company read-only with the spec copy', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const victoria = await createEntity(tx, w.org, { name: 'Victoria Gardens Dev. Ltd' })
      const parcel = await createParcel(tx, w.org, { entityId: victoria.id })
      await archiveEntityRow(tx, victoria)
      expect((await w.client.land.parcels.get({ id: parcel.id })).readOnly).toBe('entity_archived')
      await expect(w.client.land.parcels.archive({ id: parcel.id })).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'entity_archived' },
        message:
          'Victoria Gardens Dev. Ltd is archived. Restore the company to change this parcel.',
      })
    }))

  it('denies a viewer', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const viewer = await createMember(tx, w.org, { role: 'viewer' })
      await expect(w.as(viewer.user).land.parcels.archive({ id: parcel.id })).rejects.toMatchObject(
        {
          code: 'FORBIDDEN',
        },
      )
    }))
})

describe('archive and restore move the version', () => {
  it('bumps the version, so an edit loaded before the archive is stale and names who archived', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      await w.as(w.org.owner).land.parcels.archive({ id: parcel.id })
      const restored = await w.as(w.org.owner).land.parcels.restore({ id: parcel.id })
      expect((await w.client.land.parcels.get({ id: restored.id })).version).toBe(
        parcel.version + 2,
      )
      await expect(
        w.client.land.parcels.update({
          id: parcel.id,
          expectedVersion: parcel.version,
          notes: 'Fenced',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stale', changedByName: 'Olumide Bankole' },
      })
    }))
})
