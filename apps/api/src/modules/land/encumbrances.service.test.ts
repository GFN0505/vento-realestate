import type { UpdateEncumbranceInput } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents, encumbrances, titleDocuments } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  archiveEntityRow,
  clearEncumbranceRow,
  createApprovalRule,
  createEncumbrance,
  createMember,
  createParcel,
  createReadyFile,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { MAX_DOCUMENTS_PER_PARCEL } from './documents-write'
import { type LandWorld, landWorld, recordCaveat } from './land.test-world'
import { blockedParcels } from './sales-block'

// Recording and editing encumbrances (plan §2–§5, §11). Clearing is in
// encumbrances.approvals.test.ts; the block itself in sales-block.test.ts.

async function plot(w: LandWorld, name = 'Plot 22, Folu Ayo') {
  return createParcel(w.tx, w.org, { entityId: w.lekki.id, name, status: 'acquired' })
}

async function isBlocked(w: LandWorld, parcelId: string) {
  return (await blockedParcels(w.tx, { organizationId: w.org.id }, [parcelId])).has(parcelId)
}

async function eventsOf(w: LandWorld, action: string) {
  return w.tx
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, w.org.id), eq(auditEvents.action, action)))
}

describe('land.encumbrances.record', () => {
  it('saves a caveat active and blocking, files its evidence and audits it, in one go', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const detail = await w.client.land.encumbrances.record(
        recordCaveat(parcel.id, await w.file()),
      )
      expect(detail).toMatchObject({
        blocked: true,
        encumbrance: { blocked: true, count: 1, top: { type: 'caveat', blocksSales: true } },
        encumbrances: [
          {
            type: 'caveat',
            status: 'active',
            blocksSales: true,
            claimant: 'Ogunleye family',
            version: 1,
            recordedBy: { name: 'Ngozi Adeyemi' },
            detailsHidden: false,
            evidence: { name: 'Caveat · CV/LAG/2026/114', version: { versionNo: 1 } },
            clearance: null,
            pendingClear: null,
          },
        ],
      })
      expect(await isBlocked(w, parcel.id)).toBe(true)
      const [event] = await eventsOf(w, 'land.encumbrance.recorded')
      expect(event).toMatchObject({ targetType: 'parcel', targetId: parcel.id })
      expect(event?.metadata).toMatchObject({
        entityId: w.lekki.id,
        encumbranceType: 'caveat',
        blocksSales: true,
        encumbranceId: detail.encumbrances[0]?.id,
      })
      expect(await eventsOf(w, 'land.document.uploaded')).toHaveLength(1)
    }))

  it('emails owners whose companies include the parcel’s, and nobody else', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const lekkiOwner = await createMember(tx, w.org, { role: 'owner', entityIds: [w.lekki.id] })
      const parkviewOwner = await createMember(tx, w.org, {
        role: 'owner',
        entityIds: [w.parkview.id],
      })
      const { client, mailer } = clientAs(tx, w.ngozi.user, { storage: w.storage })
      await client.land.encumbrances.record(recordCaveat(parcel.id, await w.file()))
      const [email] = mailer.to(w.org.owner.email)
      expect(email).toMatchObject({ subject: 'Caveat recorded on Plot 22, Folu Ayo' })
      expect(email?.text).toContain('Caveat recorded on Plot 22, Folu Ayo · blocks new sales')
      expect(email?.text).toContain("New sales on this parcel's units are blocked")
      // Owner, 28 Nov 2026: the email never names the claimant.
      expect(email?.text).not.toContain('Ogunleye')
      expect(email?.html).not.toContain('Ogunleye')
      expect(mailer.to(lekkiOwner.user.email)).toHaveLength(1)
      expect(mailer.to(parkviewOwner.user.email)).toEqual([])
    }))

  it('records a mortgage that doesn’t block sales, and still tells the owners', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w, 'Parkview Block B')
      const { client, mailer } = clientAs(tx, w.ngozi.user, { storage: w.storage })
      const detail = await client.land.encumbrances.record(
        recordCaveat(parcel.id, await w.file(), {
          type: 'mortgage',
          blocksSales: false,
          claimant: 'Sterling Bank',
          reference: 'Construction facility',
        }),
      )
      expect(detail).toMatchObject({
        blocked: false,
        encumbrance: { blocked: false, top: { type: 'mortgage', claimant: 'Sterling Bank' } },
      })
      expect(await isBlocked(w, parcel.id)).toBe(false)
      expect(mailer.to(w.org.owner.email)[0]?.text).toContain("Sales aren't blocked.")
    }))

  it('refuses a caveat that doesn’t block sales, with the spec copy', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await expect(
        w.client.land.encumbrances.record(
          recordCaveat(parcel.id, await w.file(), { type: 'court_order', blocksSales: false }),
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(await tx.select().from(encumbrances)).toEqual([])
    }))

  it('refuses a date after today, an archived parcel and an archived company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await expect(
        w.client.land.encumbrances.record(
          recordCaveat(parcel.id, await w.file(), { servedOn: '2999-01-01' }),
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'future_date' } })
      const archived = await createParcel(tx, w.org, { entityId: w.lekki.id, archived: true })
      await expect(
        w.client.land.encumbrances.record(recordCaveat(archived.id, await w.file())),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'parcel_archived' } })
      await archiveEntityRow(tx, w.lekki)
      await expect(
        w.client.land.encumbrances.record(recordCaveat(parcel.id, await w.file())),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'entity_archived' } })
    }))

  it('refuses someone else’s file and a file already used', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const owners = await w.file(w.org.owner)
      await expect(
        w.client.land.encumbrances.record(recordCaveat(parcel.id, owners)),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'file_unavailable' } })
      const used = await w.file()
      await w.client.land.encumbrances.record(recordCaveat(parcel.id, used))
      await expect(
        w.client.land.encumbrances.record(recordCaveat(parcel.id, used, { reference: 'CV/2' })),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'file_unavailable' } })
    }))

  it('names a second caveat with the same reference “(2)”, and one without by its date', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await w.client.land.encumbrances.record(recordCaveat(parcel.id, await w.file()))
      await w.client.land.encumbrances.record(recordCaveat(parcel.id, await w.file()))
      await w.client.land.encumbrances.record(
        recordCaveat(parcel.id, await w.file(), { reference: null }),
      )
      const names = (
        await tx
          .select({ name: titleDocuments.name })
          .from(titleDocuments)
          .where(eq(titleDocuments.parcelId, parcel.id))
      ).map((d) => d.name)
      expect(names.sort()).toEqual([
        'Caveat · 4 Nov 2026',
        'Caveat · CV/LAG/2026/114',
        'Caveat · CV/LAG/2026/114 (2)',
      ])
    }))

  it('denies a role without Land & title create', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const sales = await createMember(tx, w.org, { role: 'sales' })
      const file = (await createReadyFile(tx, w.org, { uploadedBy: sales.user })).id
      await expect(
        w.as(sales.user).land.encumbrances.record(recordCaveat(parcel.id, file)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'permission' } })
    }))
})

describe('land.encumbrances.update', () => {
  it('changes only the details sent and audits before and after', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const enc = await createEncumbrance(tx, w.org, parcel, { nextOn: '2026-12-10' })
      const detail = await w.client.land.encumbrances.update({
        id: enc.id,
        expectedVersion: 1,
        nextOn: '2027-01-14',
        lawyer: 'Adaeze Okoro',
      })
      expect(detail.encumbrances[0]).toMatchObject({
        nextOn: '2027-01-14',
        lawyer: 'Adaeze Okoro',
        claimant: 'Ogunleye family',
        version: 2,
      })
      const [event] = await eventsOf(w, 'land.encumbrance.updated')
      expect(event).toMatchObject({
        before: { nextOn: '2026-12-10', lawyer: null },
        // Security M3: the trail says a lawyer was recorded, never who.
        after: { nextOn: '2027-01-14', lawyer: '(recorded)' },
      })
    }))

  it('refuses type, block choice and status: they never change', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const enc = await createEncumbrance(tx, w.org, parcel)
      for (const extra of [{ type: 'lien' }, { blocksSales: false }, { status: 'cleared' }]) {
        // Sent as a client that skipped the types would send it.
        const raw = {
          id: enc.id,
          expectedVersion: 1,
          ...extra,
        } as unknown as UpdateEncumbranceInput
        await expect(w.client.land.encumbrances.update(raw)).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        })
      }
      const [row] = await tx.select().from(encumbrances).where(eq(encumbrances.id, enc.id))
      expect(row).toMatchObject({ type: 'caveat', blocksSales: true, status: 'active' })
    }))

  it('names who saved in between', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const enc = await createEncumbrance(tx, w.org, parcel)
      await w.as(w.org.owner).land.encumbrances.update({
        id: enc.id,
        expectedVersion: 1,
        notes: 'Lawyer instructed',
      })
      await expect(
        w.client.land.encumbrances.update({ id: enc.id, expectedVersion: 1, notes: 'Mine' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stale', changedByName: 'Olumide Bankole' },
      })
    }))

  it('refuses while a request to clear it waits, and once it’s cleared', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await createApprovalRule(tx, w.org, {
        actionKey: 'land.encumbrance.clear',
        steps: [['owner']],
      })
      const enc = await createEncumbrance(tx, w.org, parcel)
      await w.client.land.encumbrances.requestClear({
        id: enc.id,
        expectedVersion: 1,
        clearedOn: '2026-11-20',
        evidence: { fileId: await w.file() },
        reason: 'Family withdrew it',
      })
      await expect(
        w.client.land.encumbrances.update({ id: enc.id, expectedVersion: 1, notes: 'x' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'clearing_pending' },
        message: 'A request to clear this caveat is waiting. Cancel it to change the details.',
      })
      const cleared = await createEncumbrance(tx, w.org, parcel, { cleared: { on: '2026-11-20' } })
      await expect(
        w.client.land.encumbrances.update({ id: cleared.id, expectedVersion: 1, notes: 'x' }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'encumbrance_cleared' } })
    }))
})

describe('encumbrances on the parcel and the list', () => {
  it('names the most serious, counts them, and stays blocked until every blocking one clears', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await createEncumbrance(tx, w.org, parcel, { type: 'mortgage', blocksSales: true })
      await createEncumbrance(tx, w.org, parcel, { type: 'lien' })
      const order = await createEncumbrance(tx, w.org, parcel, { type: 'court_order' })
      await createEncumbrance(tx, w.org, parcel, { type: 'caveat', cleared: { on: '2026-11-20' } })
      const detail = await w.client.land.parcels.get({ id: parcel.id })
      expect(detail.encumbrance).toMatchObject({ count: 3, top: { type: 'court_order' } })
      expect(detail.encumbrances.map((e) => [e.type, e.status])).toEqual([
        ['court_order', 'active'],
        ['lien', 'active'],
        ['mortgage', 'active'],
        ['caveat', 'cleared'],
      ])
      await clearEncumbranceRow(tx, order, {
        on: '2026-11-21',
        by: w.org.owner,
        clearance: { documentId: order.evidenceDocumentId, versionId: order.evidenceVersionId },
      })
      expect(await isBlocked(w, parcel.id)).toBe(true)
    }))

  it('lists encumbered parcels, mortgages included, and counts only blocked ones', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const caveat = await plot(w, 'Plot 22, Folu Ayo')
      const mortgaged = await plot(w, 'Parkview Block B')
      await plot(w, 'Epe farmland')
      await createEncumbrance(tx, w.org, caveat)
      await createEncumbrance(tx, w.org, mortgaged, { type: 'mortgage', claimant: 'Sterling Bank' })
      const all = await w.client.land.parcels.list({})
      expect(all.summary).toMatchObject({ count: 3, blocked: 1 })
      const encumbered = await w.client.land.parcels.list({ filter: 'encumbered' })
      expect(encumbered.items.map((p) => [p.name, p.encumbrance?.blocked])).toEqual([
        ['Parkview Block B', false],
        ['Plot 22, Folu Ayo', true],
      ])
    }))

  it('refuses archiving while one is active, naming the most serious, and allows it once cleared', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await createEncumbrance(tx, w.org, parcel, { type: 'mortgage' })
      await createEncumbrance(tx, w.org, parcel)
      const owner = w.as(w.org.owner)
      await expect(owner.land.parcels.archive({ id: parcel.id })).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'encumbered' },
        message: 'Clear the caveat before archiving this parcel.',
      })
      const clean = await createParcel(tx, w.org, { entityId: w.lekki.id, name: 'Clean plot' })
      await createEncumbrance(tx, w.org, clean, { cleared: { on: '2026-11-20' } })
      expect((await owner.land.parcels.archive({ id: clean.id })).archivedAt).not.toBeNull()
    }))
})

describe('encumbrance evidence in the vault', () => {
  it('keeps the pinned evidence version, even after a better scan, and still shows it', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const enc = await createEncumbrance(tx, w.org, parcel)
      const owner = w.as(w.org.owner)
      const remove = (versionId: string) =>
        owner.land.documents.removeVersion({ versionId, reason: 'Blurry scan' })
      const pinned = {
        code: 'CONFLICT',
        data: { reason: 'evidence_for_encumbrance' },
        message: 'This is the evidence for the caveat, so it stays in the vault.',
      }
      await expect(remove(enc.evidence.version.id)).rejects.toMatchObject(pinned)
      // Security M1: an active one's evidence takes a better scan; the encumbrance keeps v1.
      const v2 = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'encumbrance_evidence',
        name: enc.evidence.document.name,
        fileId: await w.file(),
      })
      expect(v2.version.versionNo).toBe(2)
      await expect(remove(enc.evidence.version.id)).rejects.toMatchObject(pinned)
      const detail = await owner.land.parcels.get({ id: parcel.id })
      expect(detail.encumbrances[0]?.evidence?.version).toMatchObject({
        id: enc.evidence.version.id,
        versionNo: 1,
      })
      await remove(v2.version.id)
    }))

  it('refuses a new version on any document of a cleared encumbrance', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const enc = await createEncumbrance(tx, w.org, parcel, { cleared: { on: '2026-11-20' } })
      for (const doc of [enc.evidence.document, enc.clearance?.document]) {
        await expect(
          w.client.land.documents.upload({
            parcelId: parcel.id,
            type: 'encumbrance_evidence',
            name: doc?.name ?? '',
            fileId: await w.file(),
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'encumbrance_cleared' } })
      }
    }))

  it('refuses a new encumbrance evidence document from the vault', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await expect(
        w.client.land.documents.upload({
          parcelId: parcel.id,
          type: 'encumbrance_evidence',
          name: 'Caveat · made up',
          fileId: await w.file(),
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'evidence_from_encumbrance' },
        message: 'Add evidence from the encumbrance.',
      })
    }))
})

describe('encumbrance dates (security L6)', () => {
  it('refuses a next date over 10 years ahead or a year before the date served', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      const record = async (extra: Partial<Parameters<typeof recordCaveat>[2]>) =>
        w.client.land.encumbrances.record(recordCaveat(parcel.id, await w.file(), extra))
      await expect(record({ nextOn: '2040-01-01' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'next_on_out_of_range' },
        message: 'Enter a date within the next 10 years.',
      })
      await expect(record({ nextOn: '2025-11-03' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      await expect(record({ servedOn: '1899-12-31' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      const enc = await createEncumbrance(tx, w.org, parcel, { nextOn: '2026-12-10' })
      await expect(
        w.client.land.encumbrances.update({ id: enc.id, expectedVersion: 1, nextOn: '2045-03-01' }),
      ).rejects.toMatchObject({ data: { reason: 'next_on_out_of_range' } })
      // A later served date must still leave the saved next date within a year before it.
      await expect(
        w.client.land.encumbrances.update({
          id: enc.id,
          expectedVersion: 1,
          servedOn: '2028-01-01',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }))
})

describe('encumbrance writes are rate limited (security L4)', () => {
  it('allows 20 records or clearing requests per person in 10 minutes, checked before any read', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const client = clientAs(tx, w.ngozi.user, { storage: w.storage, rateLimit: true }).client
      const missing = {
        id: '01900000-0000-7000-8000-0000000000ff',
        expectedVersion: 1,
        clearedOn: '2026-11-20',
        evidence: { fileId: await w.file() },
        reason: 'Withdrawn',
      }
      for (let i = 0; i < 20; i++) {
        await expect(client.land.encumbrances.requestClear(missing)).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
      }
      await expect(client.land.encumbrances.requestClear(missing)).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        data: { retryAfterSeconds: expect.any(Number) },
      })
      const parcel = await plot(w)
      await expect(
        client.land.encumbrances.record(recordCaveat(parcel.id, await w.file())),
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
      expect(await eventsOf(w, 'land.encumbrance.recorded')).toHaveLength(0)
    }))
})

describe('the vault cap (review #7)', () => {
  it('never stops an encumbrance being recorded on a parcel whose vault is full', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await plot(w)
      await tx.insert(titleDocuments).values(
        Array.from({ length: MAX_DOCUMENTS_PER_PARCEL }, (_, i) => ({
          organizationId: w.org.id,
          parcelId: parcel.id,
          type: 'other' as const,
          name: `Letter ${i + 1}`,
          createdByUserId: w.ngozi.user.id,
        })),
      )
      const detail = await w.client.land.encumbrances.record(
        recordCaveat(parcel.id, await w.file()),
      )
      expect(detail.encumbrances).toHaveLength(1)
      await expect(
        w.client.land.documents.upload({
          parcelId: parcel.id,
          type: 'other',
          name: 'One too many',
          fileId: await w.file(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'too_many_documents' } })
    }))
})
