import type { SystemRoleKey } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, createParcel } from '@/test/factories'
import { addParcel, landWorld } from './land.test-world'

describe('land.parcels.activity', () => {
  it('reads the parcel’s history newest first in plain words, without device or IP', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      const stage = parcel.stages[2]
      await w.client.land.stages.update({
        id: stage?.id ?? '',
        expectedVersion: 1,
        status: 'submitted',
        on: '2026-10-10',
      })
      const activity = await w.client.land.parcels.activity({ id: parcel.id })
      expect(activity.items.map((e) => e.what)).toEqual(['C of O submitted', 'Added the parcel'])
      expect(activity.items[0]).toMatchObject({
        actor: { name: 'Ngozi Adeyemi', kind: 'person' },
        changes: [
          { label: 'Status', before: 'Not started', after: 'Submitted' },
          { label: 'Date', before: null, after: '10 Oct 2026' },
        ],
      })
      expect(JSON.stringify(activity)).not.toMatch(/ipMasked|userAgent|device/)
    }))

  it('pages the history', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      await w.client.land.parcels.update({ id: parcel.id, expectedVersion: 1, notes: 'Fenced' })
      const page = await w.client.land.parcels.activity({ id: parcel.id, page: 2, pageSize: 1 })
      expect(page).toMatchObject({
        page: 2,
        pageSize: 1,
        total: 2,
        items: [{ what: 'Added the parcel' }],
      })
    }))

  it('answers not found for a parcel outside the member’s companies or organization', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const mine = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const theirs = await createParcel(
        tx,
        await createOrganization(tx, { name: 'Other Developer Ltd' }),
      )
      const limited = await createMember(tx, w.org, { role: 'viewer', entityIds: [w.parkview.id] })
      await expect(w.as(limited.user).land.parcels.activity({ id: mine.id })).rejects.toMatchObject(
        { code: 'NOT_FOUND' },
      )
      await expect(w.client.land.parcels.activity({ id: theirs.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))
})

describe('who sees the acquisition cost', () => {
  const sees: Record<string, boolean> = {
    owner: true,
    admin: true,
    land_legal: true,
    finance: true,
    viewer: true,
    project_manager: false,
    sales: false,
  }

  it.each(Object.entries(sees))(
    '%s: %s in the list, the detail and the activity',
    (role, visible) =>
      withRollback(async (tx) => {
        const w = await landWorld(tx)
        const parcel = await w.client.land.parcels.create(
          addParcel(w.lekki.id, { acquisitionCost: '840000000', acquiredOn: '2025-03-14' }),
        )
        const who =
          role === 'owner'
            ? w.org.owner
            : (await createMember(tx, w.org, { role: role as SystemRoleKey })).user
        const client = w.as(who)
        const [row] = (await client.land.parcels.list({})).items
        const detail = await client.land.parcels.get({ id: parcel.id })
        const activity = await client.land.parcels.activity({ id: parcel.id })
        const shown = { cost: '840000000.00', currency: 'NGN', on: '2025-03-14' }
        for (const p of [row, detail]) {
          expect(p).toMatchObject({ costHidden: !visible, acquisition: visible ? shown : null })
        }
        const text = JSON.stringify({ row, detail, activity })
        expect(text.includes('840,000,000') || text.includes('840000000')).toBe(visible)
        expect(activity.items[0]?.changes.some((c) => c.label === 'Acquisition cost')).toBe(visible)
      }),
  )
})
