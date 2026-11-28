import { Decimal, hectares } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { landHome } from '@/modules/land/land-home.service'
import { parcelDetail } from '@/modules/land/parcel-read'
import { listParcels } from '@/modules/land/parcels.service'
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
import {
  approvalRequests,
  auditEvents,
  encumbrances,
  parcels,
  titleDocumentVersions,
} from './schema'
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
  const aisha = await createMember(tx, org, { role: 'finance', name: 'Aisha Bello' })
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const storage = createMemoryStorage()
  const input = {
    organizationId: org.id,
    companies,
    officer: ngozi.user,
    approvers: { finance: aisha.user, owner: org.owner },
    storage,
  }
  return { org, ngozi, storage, input }
}

describe('seedLand', () => {
  it('seeds the six golden-thread parcels with the Land & legal queue counted from today', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const seeded = await seedLand(tx, w.input)
      expect(seeded.map((p) => p.reference)).toEqual([7, 9, 12, 15, 18, 21])
      const home = await landHome(await contextFor(tx, w.ngozi.user, w.org, w.storage), {})
      expect(
        home.queue.map((q) => [
          q.kind,
          q.parcelName,
          'stageType' in q ? q.stageType : q.encumbranceType,
          q.days,
        ]),
      ).toEqual([
        ['stalled', 'Idu family land', 'c_of_o', 94],
        ['query', 'Idu family land', 'r_of_o', 25],
        ['follow_up', 'Parkview Block B', 'c_of_o', 1],
        ['next_date', 'Idu family land', 'caveat', -12],
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
      // Slice 2 adds 4 versions (3 evidence, 1 clearance) and 11 events: 3 recorded, 4 uploads,
      // the request, both approvals and the clearing.
      expect(first).toEqual({ parcels: 6, versions: 17, events: 47 })
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

  it('seeds J-LND-03: Plot 22’s caveat cleared by Aisha and Olumide, a mortgage, Idu’s caveat', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const seeded = await seedLand(tx, w.input)
      const ctx = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const byRef = (n: number) => seeded.find((p) => p.reference === n)?.id ?? ''
      const plot22 = await parcelDetail(tx, ctx, byRef(12))
      expect(plot22).toMatchObject({ blocked: false, encumbrance: null })
      expect(plot22.encumbrances[0]).toMatchObject({
        type: 'caveat',
        status: 'cleared',
        claimant: 'Ogunleye family',
        clearance: { approvedBy: ['Aisha Bello', 'Olumide Bankole'] },
      })
      const [request] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.organizationId, w.org.id))
      expect(request).toMatchObject({ status: 'approved', makerName: 'Ngozi Adeyemi' })
      expect((await parcelDetail(tx, ctx, byRef(15))).encumbrance).toMatchObject({
        blocked: false,
        top: { type: 'mortgage', claimant: 'Sterling Bank' },
      })
      expect((await parcelDetail(tx, ctx, byRef(18))).blocked).toBe(true)
      const list = await listParcels(ctx, {
        page: 1,
        pageSize: 25,
        filter: 'all',
        sort: 'name',
        dir: 'asc',
      })
      expect(list.summary).toEqual({ count: 6, totalSqm: '450000.00', blocked: 1 })
      expect(
        await tx.select().from(encumbrances).where(eq(encumbrances.organizationId, w.org.id)),
      ).toHaveLength(3)
    }))
})
