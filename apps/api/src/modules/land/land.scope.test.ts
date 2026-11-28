import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, titleDocumentVersions } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  archiveEntityRow,
  createEntity,
  createMember,
  createParcel,
  createTitleDocument,
} from '@/test/factories'
import { type LandClient, type LandWorld, landWorld } from './land.test-world'

// Company limits and read-only parcels on every land write (review): a parcel outside the
// editor's companies is NOT_FOUND and writes nothing; an archived one (or one of an archived
// company) refuses with the spec copy.

async function rowCounts(tx: DbOrTx, organizationId: string) {
  const count = async (table: typeof auditEvents | typeof titleDocumentVersions) =>
    (
      await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.organizationId, organizationId))
    )[0]?.n
  return { events: await count(auditEvents), versions: await count(titleDocumentVersions) }
}

/** A parcel with a started stage, a kept version and a removed one. */
async function parcelWithHistory(w: LandWorld, entityId: string, archived = false) {
  const parcel = await createParcel(w.tx, w.org, {
    entityId,
    archived,
    stages: [{ type: 'survey_plan', status: 'in_progress', statusOn: '2026-11-02' }, 'c_of_o'],
  })
  const kept = await createTitleDocument(w.tx, w.org, parcel, { type: 'survey_plan' })
  const removed = await createTitleDocument(w.tx, w.org, parcel, {
    type: 'survey_plan',
    removedReason: 'Wrong parcel',
  })
  return { parcel, kept, removed, stageId: parcel.stageOf('c_of_o').id }
}

type Target = Awaited<ReturnType<typeof parcelWithHistory>>

const writes = (c: LandClient, t: Target, fileId: string) =>
  ({
    'stages.update': () =>
      c.land.stages.update({
        id: t.stageId,
        expectedVersion: 1,
        status: 'submitted',
        on: '2026-11-03',
      }),
    'stages.undo': () => c.land.stages.undo({ id: t.stageId, expectedVersion: 1 }),
    'stages.set': () =>
      c.land.stages.set({ parcelId: t.parcel.id, expectedVersion: 1, types: ['survey_plan'] }),
    'documents.upload': () =>
      c.land.documents.upload({ parcelId: t.parcel.id, type: 'c_of_o', fileId }),
    removeVersion: () =>
      c.land.documents.removeVersion({ versionId: t.kept.version.id, reason: 'Wrong parcel' }),
    restoreVersion: () => c.land.documents.restoreVersion({ versionId: t.removed.version.id }),
    archive: () => c.land.parcels.archive({ id: t.parcel.id }),
    restore: () => c.land.parcels.restore({ id: t.parcel.id }),
    update: () => c.land.parcels.update({ id: t.parcel.id, expectedVersion: 1, notes: 'Fenced' }),
  }) as const

describe('land writes and company limits', () => {
  it('answers NOT_FOUND to a Parkview-limited editor on a Lekki parcel, writing nothing', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const target = await parcelWithHistory(w, w.lekki.id)
      const limited = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      const fileId = await w.file(limited.user)
      const before = await rowCounts(tx, w.org.id)
      for (const [name, call] of Object.entries(writes(w.as(limited.user), target, fileId))) {
        await expect(call(), name).rejects.toMatchObject({ code: 'NOT_FOUND' })
      }
      expect(await rowCounts(tx, w.org.id)).toEqual(before)
    }))
})

describe('land writes on read-only parcels', () => {
  const readOnlyCalls = [
    'documents.upload',
    'removeVersion',
    'restoreVersion',
    'stages.set',
    'stages.undo',
  ] as const

  it('refuses vault and stage changes on an archived parcel', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const target = await parcelWithHistory(w, w.lekki.id, true)
      const calls = writes(w.client, target, await w.file())
      for (const name of readOnlyCalls) {
        await expect(calls[name](), name).rejects.toMatchObject({
          code: 'CONFLICT',
          data: { reason: 'parcel_archived' },
          message: 'This parcel is archived. Restore it to change it.',
        })
      }
    }))

  it('refuses vault and stage changes on a parcel of an archived company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const victoria = await createEntity(tx, w.org, { name: 'Victoria Gardens Dev. Ltd' })
      const target = await parcelWithHistory(w, victoria.id)
      await archiveEntityRow(tx, victoria)
      const calls = writes(w.client, target, await w.file())
      for (const name of readOnlyCalls) {
        await expect(calls[name](), name).rejects.toMatchObject({
          code: 'CONFLICT',
          data: { reason: 'entity_archived' },
          message:
            'Victoria Gardens Dev. Ltd is archived. Restore the company to change this parcel.',
        })
      }
    }))

  it('refuses moving a parcel into an archived company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const victoria = await createEntity(tx, w.org, { name: 'Victoria Gardens Dev. Ltd' })
      await archiveEntityRow(tx, victoria)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await expect(
        w.client.land.parcels.update({ id: parcel.id, expectedVersion: 1, entityId: victoria.id }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'entity_archived' },
        message: 'Victoria Gardens Dev. Ltd is archived. Choose another company.',
      })
    }))
})
