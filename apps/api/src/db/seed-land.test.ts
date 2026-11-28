import { Decimal, hectares } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { landHome } from '@/modules/land/land-home.service'
import { parcelDetail } from '@/modules/land/parcel-read'
import type { Storage } from '@/storage'
import { createMemoryStorage } from '@/storage/memory-driver'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createEntity,
  createMember,
  createOrganization,
  createParcel,
} from '@/test/factories'
import type { DbOrTx } from './client'
import { auditEvents, parcels, titleDocumentVersions } from './schema'
import { START_STORAGE, seedLand } from './seed-land'

async function world(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const company = async (name: string) => {
    const e = await createEntity(tx, org, { name })
    return { id: e.id, name: e.name }
  }
  const companies = {
    victoria: await company('Victoria Gardens Dev. Ltd'),
    parkview: await company('Parkview Residences SPV Ltd'),
    lekki: await company('Lekki Pearl Estates Ltd'),
  }
  const ngozi = await createMember(tx, org, { role: 'land_legal', name: 'Ngozi Adeyemi' })
  const storage = createMemoryStorage()
  const input = { organizationId: org.id, companies, officer: ngozi.user, storage }
  return { org, ngozi, storage, input }
}

describe('seedLand', () => {
  it('seeds the six golden-thread parcels with the Land & legal queue counted from today', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const seeded = await seedLand(tx, w.input)
      expect(seeded.map((p) => p.reference)).toEqual([7, 9, 12, 15, 18, 21])
      const home = await landHome(await contextFor(tx, w.ngozi.user, w.org, w.storage), {})
      expect(home.queue.map((q) => [q.kind, q.parcelName, q.stageType, q.days])).toEqual([
        ['stalled', 'Idu family land', 'c_of_o', 94],
        ['query', 'Idu family land', 'r_of_o', 25],
        ['follow_up', 'Parkview Block B', 'c_of_o', 1],
      ])
      expect(home).toMatchObject({ titledCount: 2, titlesInProgress: { count: 3, stalled: 1 } })
      const rows = await tx.select().from(parcels).where(eq(parcels.organizationId, w.org.id))
      const total = rows.reduce((n, p) => n.plus(p.sizeSqm), new Decimal(0))
      expect(hectares(total.toFixed(2))).toBe('45.00')
    }))

  it('runs again without a second parcel, document or history entry', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await seedLand(tx, w.input)
      const count = async () => ({
        parcels: (await tx.select().from(parcels).where(eq(parcels.organizationId, w.org.id)))
          .length,
        versions: (
          await tx
            .select()
            .from(titleDocumentVersions)
            .where(eq(titleDocumentVersions.organizationId, w.org.id))
        ).length,
        events: (
          await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, w.org.id))
        ).length,
      })
      const first = await count()
      await seedLand(tx, w.input)
      expect(await count()).toEqual(first)
      expect(first).toEqual({ parcels: 6, versions: 13, events: 36 })
    }))

  it('backdates the seeded stages, so none offers Undo', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const seeded = await seedLand(tx, w.input)
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      for (const p of seeded) {
        const detail = await parcelDetail(tx, ctx, p.id)
        expect(
          detail.stages.filter((s) => s.canUndo),
          p.name,
        ).toEqual([])
      }
    }))

  it('leaves a reference someone took by hand alone, on the first run and the next', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const mine = await createParcel(tx, w.org, { name: 'Our own plot' })
      await tx.update(parcels).set({ referenceNumber: 7 }).where(eq(parcels.id, mine.id))
      expect((await seedLand(tx, w.input)).map((p) => p.reference)).toEqual([9, 12, 15, 18, 21])
      await seedLand(tx, w.input)
      const [row] = await tx.select().from(parcels).where(eq(parcels.id, mine.id))
      expect(row).toMatchObject({ name: 'Our own plot', referenceNumber: 7 })
    }))

  it('stops before writing when the bucket is down', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const down: Storage = {
        ...w.storage,
        head: async () => {
          throw new Error('connect ECONNREFUSED')
        },
      }
      await expect(seedLand(tx, { ...w.input, storage: down })).rejects.toThrow(START_STORAGE)
      expect(await tx.select().from(parcels).where(eq(parcels.organizationId, w.org.id))).toEqual(
        [],
      )
    }))
})
