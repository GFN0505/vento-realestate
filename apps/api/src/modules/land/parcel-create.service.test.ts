import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents, files, parcels, titleDocumentVersions } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  archiveEntityRow,
  createEntity,
  createMember,
  createOrganization,
  createReadyFile,
} from '@/test/factories'
import { addParcel, landWorld } from './land.test-world'

describe('land.parcels.create', () => {
  it('lists the starting stages in the added event, and keeps the seller’s name out', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, { seller: 'Chief Adebayo Ogunleye' }),
      )
      const [event] = await tx
        .select({ after: auditEvents.after, metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.targetId, parcel.id), eq(auditEvents.action, 'land.parcel.created')),
        )
      expect(event?.after).toMatchObject({
        stages: 'Survey plan, Excision gazette, C of O',
        seller: '(recorded)',
      })
      expect(event?.metadata).toMatchObject({ entityId: w.lekki.id })
      expect(JSON.stringify(event)).not.toContain('Ogunleye')
    }))

  it('numbers parcels P-0001, P-0002 and never reuses a number after archiving', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const first = await w.client.land.parcels.create(addParcel(w.lekki.id))
      await w.client.land.parcels.archive({ id: first.id })
      const second = await w.client.land.parcels.create(
        addParcel(w.lekki.id, { name: 'Epe farmland' }),
      )
      expect([first.reference, second.reference]).toEqual(['P-0001', 'P-0002'])
    }))

  it('starts with survey plan, excision gazette and C of O, not started', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      expect(parcel.stages.map((s) => [s.type, s.status, s.statusOn])).toEqual([
        ['survey_plan', 'not_started', null],
        ['excision_gazette', 'not_started', null],
        ['c_of_o', 'not_started', null],
      ])
      expect(parcel).toMatchObject({
        status: 'acquired',
        sizeSqm: '42000.00',
        currentStage: { type: 'survey_plan' },
      })
    }))

  it('uses R of O instead of the excision gazette in the FCT', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, { name: 'Idu family land', state: 'FCT', lga: 'AMAC' }),
      )
      expect(parcel.stages.map((s) => s.type)).toEqual(['survey_plan', 'r_of_o', 'c_of_o'])
      expect(parcel.lga).toBe('Abuja Municipal')
    }))

  it('stores 12 plots with no plot size as 7,200 m² of 600 m² plots', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, { size: { value: '12', unit: 'plots' } }),
      )
      expect(parcel).toMatchObject({
        sizeSqm: '7200.00',
        sizeEntered: '12.0000',
        plotSizeSqm: '600.00',
      })
    }))

  it('grants a stage whose document was uploaded, dated by its issue date, and audits fromAdd', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, {
          status: 'under_acquisition',
          documents: [
            {
              fileId: await w.file(),
              type: 'survey_plan',
              number: 'LS/D/1234',
              issuedOn: '2025-09-02',
            },
            { fileId: await w.file(), type: 'family_receipt' },
          ],
        }),
      )
      expect(parcel.stages.map((s) => [s.type, s.status, s.statusOn, s.reference])).toEqual([
        ['survey_plan', 'granted', '2025-09-02', 'LS/D/1234'],
        ['excision_gazette', 'not_started', null, null],
        ['c_of_o', 'not_started', null, null],
      ])
      expect(parcel.documents.map((d) => [d.type, d.stageType, d.latest?.versionNo])).toEqual([
        ['survey_plan', 'survey_plan', 1],
        ['family_receipt', null, 1],
      ])
      const events = await tx
        .select({ action: auditEvents.action, metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.targetId, parcel.id),
            eq(auditEvents.action, 'land.title_stage.updated'),
          ),
        )
      expect(events).toEqual([
        {
          action: 'land.title_stage.updated',
          metadata: expect.objectContaining({ fromAdd: true, stageType: 'survey_plan' }),
        },
      ])
    }))

  it('leaves a granted stage undated when the document has no issue date', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, { documents: [{ fileId: await w.file(), type: 'survey_plan' }] }),
      )
      expect(parcel.stages[0]).toMatchObject({ status: 'granted', statusOn: null })
    }))

  it('opens as titled when acquired with every stage documented', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const documents = [
        { fileId: await w.file(), type: 'survey_plan' as const },
        { fileId: await w.file(), type: 'excision_gazette' as const },
        { fileId: await w.file(), type: 'c_of_o' as const },
      ]
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id, { documents }))
      expect(parcel).toMatchObject({
        status: 'titled',
        stagesGranted: 3,
        stagesTotal: 3,
        currentStage: null,
      })
    }))

  it('keeps an under-acquisition parcel with every stage documented under acquisition', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, {
          status: 'under_acquisition',
          stages: ['c_of_o'],
          documents: [{ fileId: await w.file(), type: 'c_of_o' }],
        }),
      )
      expect(parcel).toMatchObject({ status: 'under_acquisition', stagesGranted: 1 })
    }))

  it('grants nothing for receipts, purchase agreements and other documents', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(
        addParcel(w.lekki.id, {
          documents: [
            { fileId: await w.file(), type: 'family_receipt' },
            { fileId: await w.file(), type: 'land_purchase_agreement' },
            { fileId: await w.file(), type: 'other', name: 'Site photo' },
          ],
        }),
      )
      expect(parcel.stages.every((s) => s.status === 'not_started')).toBe(true)
      expect(parcel.documents).toHaveLength(3)
    }))

  it('attaches the files in the same transaction', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const fileId = await w.file()
      await w.client.land.parcels.create(
        addParcel(w.lekki.id, { documents: [{ fileId, type: 'c_of_o' }] }),
      )
      const [file] = await tx.select().from(files).where(eq(files.id, fileId))
      expect(file?.attachedAt).not.toBeNull()
      expect(file?.objectKey.startsWith('kept/')).toBe(true)
    }))

  it('refuses a file already attached, or uploaded by someone else, and saves nothing', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const attached = await createReadyFile(tx, w.org, {
        uploadedBy: w.ngozi.user,
        attached: true,
      })
      const others = await w.file(w.org.owner)
      for (const fileId of [attached.id, others]) {
        await expect(
          w.client.land.parcels.create(
            addParcel(w.lekki.id, { documents: [{ fileId, type: 'c_of_o' }] }),
          ),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'file_unavailable' } })
      }
      expect(await tx.select().from(parcels).where(eq(parcels.organizationId, w.org.id))).toEqual(
        [],
      )
      expect(
        await tx
          .select()
          .from(titleDocumentVersions)
          .where(eq(titleDocumentVersions.organizationId, w.org.id)),
      ).toEqual([])
    }))

  it("refuses another organization's file as unavailable", () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const theirFile = await createReadyFile(tx, theirs, {
        uploadedBy: theirs.owner,
        storage: w.storage,
      })
      await expect(
        w.client.land.parcels.create(
          addParcel(w.lekki.id, { documents: [{ fileId: theirFile.id, type: 'c_of_o' }] }),
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'file_unavailable' } })
    }))

  it('answers not found for a company outside the member’s access', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const limited = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      await expect(
        w.as(limited.user).land.parcels.create(addParcel(w.lekki.id)),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))

  it('refuses an archived company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const old = await archiveEntityRow(
        tx,
        await createEntity(tx, w.org, { name: 'Ikoyi Crest Ltd' }),
      )
      await expect(w.client.land.parcels.create(addParcel(old.id))).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'entity_archived' },
        message: 'Ikoyi Crest Ltd is archived. Choose another company.',
      })
    }))

  it('refuses an LGA that isn’t in the state', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await expect(
        w.client.land.parcels.create(addParcel(w.lekki.id, { lga: 'Abuja Municipal' })),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { issues: [expect.objectContaining({ message: 'Pick an LGA in Lagos.' })] },
      })
    }))

  it('refuses an acquisition date or issue date after today', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await expect(
        w.client.land.parcels.create(addParcel(w.lekki.id, { acquiredOn: '2999-01-01' })),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'future_date' },
        message: 'Enter a date on or before today.',
      })
      await expect(
        w.client.land.parcels.create(
          addParcel(w.lekki.id, {
            documents: [{ fileId: await w.file(), type: 'c_of_o', issuedOn: '2999-01-01' }],
          }),
        ),
      ).rejects.toMatchObject({ data: { reason: 'future_date' } })
    }))

  it('denies a sales member', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const grace = await createMember(tx, w.org, { role: 'sales', name: 'Grace Umeh' })
      await expect(
        w.as(grace.user).land.parcels.create(addParcel(w.lekki.id)),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'permission' },
      })
    }))
})

describe('land.parcels.nameTaken', () => {
  it('finds an active parcel by name in any case, except the one being edited', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create(addParcel(w.lekki.id))
      expect(await w.client.land.parcels.nameTaken({ name: 'plot 22, folu ayo' })).toEqual({
        id: parcel.id,
        name: 'Plot 22, Folu Ayo',
      })
      expect(
        await w.client.land.parcels.nameTaken({ name: 'Plot 22, Folu Ayo', excludeId: parcel.id }),
      ).toBeNull()
      await w.client.land.parcels.archive({ id: parcel.id })
      expect(await w.client.land.parcels.nameTaken({ name: 'Plot 22, Folu Ayo' })).toBeNull()
    }))

  it('never names a parcel of a company the member can’t see', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await w.client.land.parcels.create(addParcel(w.lekki.id))
      const limited = await createMember(tx, w.org, { role: 'viewer', entityIds: [w.parkview.id] })
      expect(
        await w.as(limited.user).land.parcels.nameTaken({ name: 'Plot 22, Folu Ayo' }),
      ).toBeNull()
    }))
})
