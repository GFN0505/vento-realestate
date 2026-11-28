import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents } from '@/db/schema'
import { lagosIsoDate } from '@/lib/format'
import { withRollback } from '@/test/db'
import { createCustomRole, createMember } from '@/test/factories'
import { addParcel, type LandWorld, landWorld } from './land.test-world'
import { ANOTHER_COMPANY } from './land-visibility'

// Who sees the acquisition and the seller (spec question 5; seller: owner, 28 Nov 2026), and how
// companies and document names read, in the parcel page, its Activity and the audit log.

const today = () => lagosIsoDate(new Date())
const window = () => ({ from: today(), to: today() })

/** A parcel with a cost and a seller, then an edit of only those (Ngozi, Land & legal). */
async function costedParcel(w: LandWorld) {
  const parcel = await w.client.land.parcels.create(
    addParcel(w.lekki.id, {
      acquisitionCost: '840000000',
      acquiredOn: '2025-09-02',
      seller: 'Chief Adebayo Ogunleye',
    }),
  )
  await w.client.land.parcels.update({
    id: parcel.id,
    expectedVersion: parcel.version,
    acquisitionCost: '850000000',
    seller: 'Ogunleye family',
  })
  return parcel
}

/** Settings edit (the audit log) without Land & title edit or Finance view. */
async function officeAdmin(w: LandWorld) {
  const role = await createCustomRole(w.tx, w.org, {
    name: 'Office admin',
    permissions: { settings: ['view', 'edit'], land: ['view'] },
  })
  return (await createMember(w.tx, w.org, { role: 'admin', roleId: role.id })).user
}

describe('land visibility: cost and seller', () => {
  it('records whether a seller was recorded or changed, never the name', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await costedParcel(w)
      const rows = await tx
        .select({
          action: auditEvents.action,
          before: auditEvents.before,
          after: auditEvents.after,
        })
        .from(auditEvents)
        .where(eq(auditEvents.targetId, parcel.id))
      expect(JSON.stringify(rows)).not.toMatch(/Ogunleye/)
      expect(rows.find((r) => r.action === 'land.parcel.created')?.after).toMatchObject({
        seller: '(recorded)',
      })
      expect(rows.find((r) => r.action === 'land.parcel.updated')).toMatchObject({
        before: { seller: '(recorded)' },
        after: { seller: '(changed)' },
      })
    }))

  it('sends the seller only to people who can see the cost', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await costedParcel(w)
      const grace = await createMember(tx, w.org, { role: 'sales' })
      expect(await w.as(grace.user).land.parcels.get({ id: parcel.id })).toMatchObject({
        seller: null,
        sellerHidden: true,
        acquisition: null,
        costHidden: true,
      })
      expect(await w.client.land.parcels.get({ id: parcel.id })).toMatchObject({
        seller: 'Ogunleye family',
        sellerHidden: false,
      })
    }))

  it('strips cost and seller from Activity and drops an edit of only those', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await costedParcel(w)
      const grace = await createMember(tx, w.org, { role: 'sales' })
      const activity = await w.as(grace.user).land.parcels.activity({ id: parcel.id })
      expect(activity.total).toBe(1)
      expect(activity.items[0]?.what).toBe('Added the parcel')
      const labels = activity.items[0]?.changes.map((c) => c.label)
      expect(labels).not.toContain('Acquisition cost')
      expect(labels).not.toContain('Acquisition date')
      expect(labels).not.toContain('Bought from')
      expect((await w.client.land.parcels.activity({ id: parcel.id })).total).toBe(2)
    }))

  it('strips cost and seller from the audit log, its entry sheet and its CSV', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await costedParcel(w)
      const admin = w.as(await officeAdmin(w))
      const log = await admin.audit.list(window())
      const land = log.items.filter((i) => i.module === 'land')
      expect(land.map((i) => i.what)).toEqual(['Added parcel Plot 22, Folu Ayo'])
      expect(JSON.stringify(land)).not.toMatch(/₦|840,000,000|Bought from|Acquisition/)
      const [created] = await tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.targetId, parcel.id), eq(auditEvents.action, 'land.parcel.created')),
        )
      const sheet = await admin.audit.get({ id: created?.id ?? '' })
      expect(JSON.stringify(sheet.changes)).not.toMatch(/₦|Bought from|Acquisition/)
      const csv = await (await admin.audit.export(window())).text()
      expect(csv).not.toMatch(/₦|840,000,000|Bought from|Acquisition/)
      expect(csv).toContain('Added parcel Plot 22, Folu Ayo')
    }))
})

describe('land visibility: companies and document names', () => {
  it('names a company outside the viewer’s access as another company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      await w.client.land.parcels.update({
        id: parcel.id,
        expectedVersion: parcel.version,
        entityId: w.parkview.id,
      })
      const limited = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      const [moved] = (await w.as(limited.user).land.parcels.activity({ id: parcel.id })).items
      expect(moved?.changes).toContainEqual({
        label: 'Company',
        before: ANOTHER_COMPANY,
        after: 'Parkview Residences SPV Ltd',
      })
      expect(JSON.stringify(moved)).not.toContain('Lekki Pearl')
      const [full] = (await w.client.land.parcels.activity({ id: parcel.id })).items
      expect(full?.changes).toContainEqual({
        label: 'Company',
        before: 'Lekki Pearl Estates Ltd',
        after: 'Parkview Residences SPV Ltd',
      })
    }))

  it('keeps document names out of audit metadata, reading them from the vault', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      const upload = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'family_receipt',
        name: 'Adeyemi family',
        fileId: await w.file(),
      })
      await w.client.land.documents.link({ versionId: upload.version.id, disposition: 'inline' })
      const stored = await tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(eq(auditEvents.targetId, parcel.id))
      expect(JSON.stringify(stored)).not.toContain('Adeyemi')
      const [shown] = (await w.client.land.parcels.activity({ id: parcel.id })).items
      expect(shown?.what).toBe('Uploaded family receipt (Adeyemi family) v1')
    }))
})
