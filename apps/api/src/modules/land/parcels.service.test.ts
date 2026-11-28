import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, createParcel } from '@/test/factories'
import { landWorld } from './land.test-world'

describe('land.parcels.list', () => {
  async function sixParcels(
    w: Awaited<ReturnType<typeof landWorld>>,
    tx: Parameters<typeof createParcel>[0],
  ) {
    const plot = await createParcel(tx, w.org, {
      entityId: w.lekki.id,
      sizeSqm: '42000.00',
      stages: [{ type: 'survey_plan', status: 'granted', statusOn: '2025-09-02' }, 'c_of_o'],
    })
    const victoria = await createParcel(tx, w.org, {
      entityId: w.lekki.id,
      name: 'Victoria Gardens tract',
      area: 'Ajah',
      lga: 'Eti-Osa',
      sizeSqm: '68000.00',
      status: 'titled',
      stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2025-01-10' }],
    })
    const parkview = await createParcel(tx, w.org, {
      entityId: w.parkview.id,
      name: 'Parkview Block B',
      area: 'Gbagada',
      lga: 'Kosofe',
      sizeSqm: '11000.00',
    })
    const old = await createParcel(tx, w.org, {
      entityId: w.lekki.id,
      name: 'Old plot',
      archived: true,
    })
    return { plot, victoria, parkview, old }
  }

  it('lists the viewer’s parcels with the current stage and a summary of what isn’t archived', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await sixParcels(w, tx)
      const list = await w.client.land.parcels.list({})
      expect(list.items.map((p) => p.name)).toEqual([
        'Parkview Block B',
        'Plot 22, Folu Ayo',
        'Victoria Gardens tract',
      ])
      expect(list).toMatchObject({
        page: 1,
        total: 3,
        summary: { count: 3, totalSqm: '121000.00' },
      })
      expect(list.items[1]).toMatchObject({
        reference: 'P-0001',
        currentStage: { type: 'c_of_o', status: 'not_started', statusOn: null },
        stagesGranted: 1,
        stagesTotal: 2,
        entity: { id: w.lekki.id, name: 'Lekki Pearl Estates Ltd', archived: false },
      })
    }))

  it('filters titled, in progress and archived', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await sixParcels(w, tx)
      const names = async (filter: 'titled' | 'in_progress' | 'archived') =>
        (await w.client.land.parcels.list({ filter })).items.map((p) => p.name)
      expect(await names('titled')).toEqual(['Victoria Gardens tract'])
      expect(await names('in_progress')).toEqual(['Plot 22, Folu Ayo'])
      expect(await names('archived')).toEqual(['Old plot'])
    }))

  it('searches by name, area, LGA and reference', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await sixParcels(w, tx)
      const names = async (q: string) =>
        (await w.client.land.parcels.list({ q })).items.map((p) => p.name)
      expect(await names('folu')).toEqual(['Plot 22, Folu Ayo'])
      expect(await names('ajah')).toEqual(['Victoria Gardens tract'])
      expect(await names('kosofe')).toEqual(['Parkview Block B'])
      expect(await names('P-0003')).toEqual(['Parkview Block B'])
      expect(await names('p-2')).toEqual(['Victoria Gardens tract'])
      expect(await names('%')).toEqual([])
    }))

  it('sorts by size, reference and name, either way, and pages', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await sixParcels(w, tx)
      const size = await w.client.land.parcels.list({ sort: 'size', dir: 'desc' })
      expect(size.items.map((p) => p.sizeSqm)).toEqual(['68000.00', '42000.00', '11000.00'])
      const ref = await w.client.land.parcels.list({ sort: 'reference', pageSize: 2, page: 2 })
      expect(ref).toMatchObject({ total: 3, items: [{ reference: 'P-0003' }] })
    }))

  it('follows the company switcher within the member’s companies', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await sixParcels(w, tx)
      const byLekki = await w.client.land.parcels.list({ entityId: w.lekki.id })
      expect(byLekki.summary).toEqual({ count: 2, totalSqm: '110000.00', blocked: 0 })
      const limited = await createMember(tx, w.org, { role: 'viewer', entityIds: [w.parkview.id] })
      const own = await w.as(limited.user).land.parcels.list({})
      expect(own.items.map((p) => p.name)).toEqual(['Parkview Block B'])
      const outside = await w.as(limited.user).land.parcels.list({ entityId: w.lekki.id })
      expect(outside).toMatchObject({
        items: [],
        total: 0,
        summary: { count: 0, totalSqm: '0.00', blocked: 0 },
      })
    }))

  it('lists only this organization’s parcels', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createParcel(tx, theirs, { name: 'Their parcel' })
      expect((await w.client.land.parcels.list({})).total).toBe(0)
      expect((await w.client.land.parcels.list({ q: 'Their' })).items).toEqual([])
    }))
})

describe('land.parcels.get', () => {
  it('returns the detail with what the viewer may do', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const detail = await w.client.land.parcels.get({ id: parcel.id })
      expect(detail).toMatchObject({
        version: 1,
        readOnly: null,
        can: { edit: true, create: true, delete: true, record: true, clear: true },
        blocked: false,
        encumbrances: [],
        encumbrance: null,
        stages: [{ type: 'survey_plan' }, { type: 'excision_gazette' }, { type: 'c_of_o' }],
        documents: [],
      })
      const viewer = await createMember(tx, w.org, { role: 'viewer' })
      expect((await w.as(viewer.user).land.parcels.get({ id: parcel.id })).can).toEqual({
        edit: false,
        create: false,
        delete: false,
        record: false,
        clear: false,
      })
    }))

  it('suggests the issuer last used for each stage on parcels in the same state', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [
          {
            type: 'c_of_o',
            status: 'submitted',
            statusOn: '2026-10-10',
            issuedBy: 'Lagos State Lands Bureau',
          },
        ],
      })
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        state: 'FCT',
        stages: [{ type: 'c_of_o', status: 'submitted', statusOn: '2026-10-10', issuedBy: 'AGIS' }],
      })
      const fresh = await createParcel(tx, w.org, { entityId: w.lekki.id, name: 'Epe farmland' })
      expect((await w.client.land.parcels.get({ id: fresh.id })).suggestedIssuers).toEqual({
        c_of_o: 'Lagos State Lands Bureau',
      })
    }))

  it('answers not found for a parcel of a company outside the member’s access', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const limited = await createMember(tx, w.org, { role: 'viewer', entityIds: [w.parkview.id] })
      await expect(w.as(limited.user).land.parcels.get({ id: parcel.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))

  it('answers not found for a parcel in another organization', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const foreign = await createParcel(tx, theirs)
      await expect(w.client.land.parcels.get({ id: foreign.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))

  it('denies a role without Land & title', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const hr = await createMember(tx, w.org, { role: 'hr' })
      await expect(w.as(hr.user).land.parcels.get({ id: parcel.id })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    }))
})
