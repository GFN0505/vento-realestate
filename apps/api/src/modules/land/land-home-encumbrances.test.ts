import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import {
  archiveEntityRow,
  createEncumbrance,
  createMember,
  createOrganization,
  createParcel,
} from '@/test/factories'
import { type LandWorld, landWorld } from './land.test-world'
import { lagosToday } from './land-access'
import { mergeQueue } from './land-home.service'

// Encumbrances on the homes (plan §7): the Land & legal tile, panel and next-date items, and
// the executive home's blocked parcels (land.blockers).

/** The Lagos date `n` days from today (negative: before). */
const inDays = (n: number): string =>
  new Date(Date.parse(`${lagosToday()}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

async function parcelIn(w: LandWorld, entityId: string, name: string) {
  return createParcel(w.tx, w.org, { entityId, name, status: 'acquired', stages: ['c_of_o'] })
}

describe('land.home: encumbrances', () => {
  it('counts blocked parcels per company with the oldest, and lists five, blocking first', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const plot22 = await parcelIn(w, w.lekki.id, 'Plot 22, Folu Ayo')
      const block = await parcelIn(w, w.parkview.id, 'Parkview Block B')
      const idu = await parcelIn(w, w.lekki.id, 'Idu family land')
      await createEncumbrance(tx, w.org, plot22, { servedOn: '2026-09-02' })
      await createEncumbrance(tx, w.org, plot22, { type: 'lien', servedOn: '2026-10-01' })
      await createEncumbrance(tx, w.org, block, { type: 'mortgage', servedOn: '2026-03-01' })
      await createEncumbrance(tx, w.org, idu, { type: 'court_order', nextOn: inDays(12) })
      const { encumbrances } = await w.client.land.home({})
      expect(encumbrances).toMatchObject({
        blockedParcels: 2,
        oldestBlockingSince: '2026-09-02',
        byEntity: [{ entityId: w.lekki.id, name: w.lekki.name, count: 2 }],
        activeCount: 4,
      })
      expect(encumbrances.active.map((e) => [e.type, e.parcelName])).toEqual([
        ['court_order', 'Idu family land'],
        ['caveat', 'Plot 22, Folu Ayo'],
        ['lien', 'Plot 22, Folu Ayo'],
        ['mortgage', 'Parkview Block B'],
      ])
      const parkviewOnly = await w.client.land.home({ entityId: w.parkview.id })
      expect(parkviewOnly.encumbrances).toMatchObject({ blockedParcels: 0, activeCount: 1 })
    }))

  it('puts next dates in the queue from 30 days ahead, and keeps a passed one until updated', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await parcelIn(w, w.lekki.id, 'Plot 22, Folu Ayo')
      await createEncumbrance(tx, w.org, parcel, { type: 'court_order', nextOn: inDays(30) })
      await createEncumbrance(tx, w.org, parcel, { type: 'caveat', nextOn: inDays(31) })
      await createEncumbrance(tx, w.org, parcel, { type: 'lien', nextOn: inDays(-3) })
      await createEncumbrance(tx, w.org, parcel, {
        type: 'mortgage',
        nextOn: inDays(30),
        blocksSales: false,
      })
      const { queue } = await w.client.land.home({})
      expect(
        queue.map((q) => (q.kind === 'next_date' ? [q.encumbranceType, q.days, q.blocksSales] : q)),
      ).toEqual([
        ['lien', 3, true],
        ['court_order', -30, true],
        ['mortgage', -30, false],
      ])
    }))

  it('shows next dates only to people who can act, and nothing of an archived company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await parcelIn(w, w.lekki.id, 'Plot 22, Folu Ayo')
      await createEncumbrance(tx, w.org, parcel, { nextOn: inDays(5) })
      const sales = await createMember(tx, w.org, { role: 'sales' })
      expect((await w.as(sales.user).land.home({})).queue).toEqual([])
      expect((await w.as(sales.user).land.home({})).encumbrances.blockedParcels).toBe(1)
      await archiveEntityRow(tx, w.lekki)
      // Review #8: the tile, the panel and the queue agree on an archived company: left out.
      const home = await w.client.land.home({})
      expect(home.queue).toEqual([])
      expect(home.encumbrances).toMatchObject({ blockedParcels: 0, activeCount: 0, active: [] })
    }))

  it('follows a member’s company limits', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await parcelIn(w, w.lekki.id, 'Plot 22, Folu Ayo')
      await createEncumbrance(tx, w.org, parcel, { nextOn: inDays(5) })
      const limited = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      const home = await w.as(limited.user).land.home({})
      expect(home.encumbrances).toMatchObject({ blockedParcels: 0, activeCount: 0, active: [] })
      expect(home.queue).toEqual([])
    }))
})

describe('mergeQueue', () => {
  const stage = (kind: 'query' | 'stalled', due: string) => ({
    kind,
    parcelId: '01900000-0000-7000-8000-0000000000a1',
    parcelName: 'Plot 22',
    due,
    days: 1,
    stageId: '01900000-0000-7000-8000-0000000000a2',
    stageType: 'c_of_o' as const,
  })
  const next = (blocksSales: boolean, due: string) => ({
    kind: 'next_date' as const,
    parcelId: '01900000-0000-7000-8000-0000000000a1',
    parcelName: 'Plot 22',
    due,
    days: 0,
    encumbranceId: '01900000-0000-7000-8000-0000000000a3',
    encumbranceType: 'caveat' as const,
    blocksSales,
  })

  it('sorts by due date, a blocking encumbrance first on a tie, and keeps 20', () => {
    const merged = mergeQueue(
      [stage('stalled', '2026-11-01'), stage('query', '2026-11-01')],
      [next(false, '2026-11-01'), next(true, '2026-11-01'), next(true, '2026-10-01')],
    )
    expect(merged.map((q) => [q.kind, q.due, q.kind === 'next_date' && q.blocksSales])).toEqual([
      ['next_date', '2026-10-01', true],
      ['next_date', '2026-11-01', true],
      ['query', '2026-11-01', false],
      ['stalled', '2026-11-01', false],
      ['next_date', '2026-11-01', false],
    ])
    expect(
      mergeQueue(
        Array.from({ length: 15 }, () => stage('query', '2026-11-01')),
        Array.from({ length: 15 }, () => next(true, '2026-11-02')),
      ),
    ).toHaveLength(20)
  })
})

describe('land.blockers', () => {
  it('lists blocked parcels oldest first with the most serious and how many more', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const plot22 = await parcelIn(w, w.lekki.id, 'Plot 22, Folu Ayo')
      const idu = await parcelIn(w, w.parkview.id, 'Idu family land')
      const block = await parcelIn(w, w.parkview.id, 'Parkview Block B')
      await createEncumbrance(tx, w.org, plot22, {
        type: 'court_order',
        reference: 'FHC/L/CS/1182/2026',
        servedOn: '2026-11-04',
      })
      await createEncumbrance(tx, w.org, plot22, { type: 'mortgage', blocksSales: false })
      await createEncumbrance(tx, w.org, idu, { servedOn: '2026-08-01', reference: null })
      await createEncumbrance(tx, w.org, block, { type: 'mortgage', blocksSales: false })
      const owner = w.as(w.org.owner)
      expect(await owner.land.blockers({})).toEqual({
        items: [
          {
            parcelId: idu.id,
            parcelName: 'Idu family land',
            type: 'caveat',
            reference: null,
            others: 0,
            since: '2026-08-01',
          },
          {
            parcelId: plot22.id,
            parcelName: 'Plot 22, Folu Ayo',
            type: 'court_order',
            reference: 'FHC/L/CS/1182/2026',
            others: 1,
            since: '2026-11-04',
          },
        ],
        total: 2,
      })
      expect((await owner.land.blockers({ entityId: w.lekki.id })).total).toBe(1)
    }))

  it('follows company limits and answers not found without the feature', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await parcelIn(w, w.lekki.id, 'Plot 22, Folu Ayo')
      await createEncumbrance(tx, w.org, parcel)
      const limited = await createMember(tx, w.org, { role: 'admin', entityIds: [w.parkview.id] })
      expect(await w.as(limited.user).land.blockers({})).toEqual({ items: [], total: 0 })
      const starter = await createOrganization(tx, { planKey: 'starter' })
      await expect(w.as(starter.owner).land.blockers({})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))
})
