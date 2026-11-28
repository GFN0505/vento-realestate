import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createMember, createParcel, createTitleDocument } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { MAX_DOCUMENTS_PER_PARCEL } from './documents-write'
import { landWorld } from './land.test-world'

describe('land.documents.upload', () => {
  it('makes a same-type upload the next version, and counts earlier ones', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const first = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'survey_plan',
        fileId: await w.file(),
      })
      const second = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'survey_plan',
        fileId: await w.file(),
        number: 'LS/D/1234',
      })
      expect(second.document.id).toBe(first.document.id)
      expect(second).toMatchObject({
        version: { versionNo: 2, number: 'LS/D/1234' },
        document: { earlierCount: 1 },
      })
    }))

  it('never grants a stage by itself', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        status: 'acquired',
        stages: ['c_of_o'],
      })
      await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'c_of_o',
        fileId: await w.file(),
      })
      expect(await w.client.land.parcels.get({ id: parcel.id })).toMatchObject({
        status: 'acquired',
        stages: [{ status: 'not_started' }],
      })
    }))

  it('keeps separate named receipts apart, and needs the name for a separate one', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const first = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'family_receipt',
        fileId: await w.file(),
      })
      await expect(
        w.client.land.documents.upload({
          parcelId: parcel.id,
          type: 'family_receipt',
          separate: true,
          fileId: await w.file(),
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { issues: [expect.objectContaining({ message: 'Which one? e.g. Adeyemi family' })] },
      })
      const adeyemi = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'family_receipt',
        name: 'Adeyemi family',
        separate: true,
        fileId: await w.file(),
      })
      expect(adeyemi.document.id).not.toBe(first.document.id)
      expect(adeyemi.version.versionNo).toBe(1)
    }))

  it('matches other documents by name, in any case', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await expect(
        w.client.land.documents.upload({
          parcelId: parcel.id,
          type: 'other',
          fileId: await w.file(),
        }),
      ).rejects.toMatchObject({
        data: {
          issues: [expect.objectContaining({ message: 'Name this document, e.g. Query letter' })],
        },
      })
      const a = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'other',
        name: 'Query letter',
        fileId: await w.file(),
      })
      const b = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'other',
        name: 'query LETTER',
        fileId: await w.file(),
      })
      const c = await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'other',
        name: 'Site photo',
        fileId: await w.file(),
      })
      expect([
        b.document.id === a.document.id,
        b.version.versionNo,
        c.document.id === a.document.id,
      ]).toEqual([true, 2, false])
    }))

  it('refuses a file that isn’t the uploader’s finished upload', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await expect(
        w.client.land.documents.upload({
          parcelId: parcel.id,
          type: 'c_of_o',
          fileId: await w.file(w.org.owner),
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'file_unavailable' },
        message: 'This file is no longer available. Upload it again.',
      })
    }))
})

describe('land.documents.removeVersion and restoreVersion', () => {
  it('hides a removed version from the vault with its reason in the history, then restores it', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const v1 = await createTitleDocument(tx, w.org, parcel, { type: 'survey_plan' })
      const v2 = await createTitleDocument(tx, w.org, parcel, { type: 'survey_plan' })
      await expect(
        w.client.land.documents.removeVersion({ versionId: v2.version.id, reason: 'x' }),
      ).rejects.toMatchObject({
        data: { issues: [expect.objectContaining({ message: 'Say why, e.g. wrong parcel' })] },
      })
      const removed = await w.client.land.documents.removeVersion({
        versionId: v2.version.id,
        reason: 'Wrong parcel',
      })
      expect(removed.document).toMatchObject({ latest: { id: v1.version.id }, earlierCount: 0 })
      const versions = await w.client.land.documents.versions({ documentId: v1.document.id })
      expect(versions.map((v) => [v.versionNo, v.removed?.reason ?? null])).toEqual([
        [2, 'Wrong parcel'],
        [1, null],
      ])
      const activity = await w.client.land.parcels.activity({ id: parcel.id })
      expect(activity.items[0]?.what).toBe('Removed survey plan v2 · Wrong parcel')
      const restored = await w.client.land.documents.restoreVersion({ versionId: v2.version.id })
      expect(restored.document.latest?.id).toBe(v2.version.id)
      expect((await w.client.land.parcels.activity({ id: parcel.id })).items[0]?.what).toBe(
        'Restored survey plan v2',
      )
    }))

  it('refuses to remove the only evidence behind a granted stage, with the spec copy', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2025-01-10' }],
      })
      const only = await createTitleDocument(tx, w.org, parcel, { type: 'c_of_o' })
      await expect(
        w.client.land.documents.removeVersion({
          versionId: only.version.id,
          reason: 'Wrong parcel',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'evidence_for_granted' },
        message: 'This is the evidence for the granted C of O. Upload the right file first.',
      })
      const second = await createTitleDocument(tx, w.org, parcel, { type: 'c_of_o' })
      await w.client.land.documents.removeVersion({
        versionId: only.version.id,
        reason: 'Blurred scan',
      })
      expect((await w.client.land.parcels.get({ id: parcel.id })).documents[0]?.latest?.id).toBe(
        second.version.id,
      )
    }))

  it('denies a viewer', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const doc = await createTitleDocument(tx, w.org, parcel, { type: 'survey_plan' })
      const viewer = await createMember(tx, w.org, { role: 'viewer' })
      await expect(
        w
          .as(viewer.user)
          .land.documents.removeVersion({ versionId: doc.version.id, reason: 'Wrong parcel' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }))
})

describe('land.documents.link', () => {
  it('signs a 5-minute link and audits who opened which version, never the link', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const doc = await createTitleDocument(tx, w.org, parcel, {
        type: 'c_of_o',
        storage: w.storage,
      })
      const grace = await createMember(tx, w.org, { role: 'sales', name: 'Grace Umeh' })
      const link = await w
        .as(grace.user)
        .land.documents.link({ versionId: doc.version.id, disposition: 'inline' })
      const seconds = (Date.parse(link.expiresAt) - Date.now()) / 1000
      expect(seconds).toBeGreaterThan(290)
      expect(seconds).toBeLessThanOrEqual(300)
      const events = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.targetId, parcel.id),
            eq(auditEvents.action, 'land.document.link_issued'),
          ),
        )
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        actorName: 'Grace Umeh',
        targetType: 'parcel',
        targetLabel: 'Plot 22, Folu Ayo',
        metadata: expect.objectContaining({
          versionId: doc.version.id,
          versionNo: 1,
          disposition: 'inline',
          entityId: w.lekki.id,
        }),
      })
      expect(JSON.stringify(events[0])).not.toContain(link.url)
    }))

  it('keeps links out of the parcel’s activity', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const doc = await createTitleDocument(tx, w.org, parcel, {
        type: 'c_of_o',
        storage: w.storage,
      })
      await w.client.land.documents.link({ versionId: doc.version.id, disposition: 'attachment' })
      expect((await w.client.land.parcels.activity({ id: parcel.id })).total).toBe(0)
    }))

  it('answers not found outside the member’s companies, and audits nothing', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const doc = await createTitleDocument(tx, w.org, parcel, {
        type: 'c_of_o',
        storage: w.storage,
      })
      const limited = await createMember(tx, w.org, { role: 'viewer', entityIds: [w.parkview.id] })
      await expect(
        w
          .as(limited.user)
          .land.documents.link({ versionId: doc.version.id, disposition: 'attachment' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
        w.as(limited.user).land.documents.versions({ documentId: doc.document.id }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      const events = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'land.document.link_issued'))
      expect(events.filter((e) => e.organizationId === w.org.id)).toEqual([])
    }))

  it('denies a role without Land & title', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const doc = await createTitleDocument(tx, w.org, parcel, {
        type: 'c_of_o',
        storage: w.storage,
      })
      const facility = await createMember(tx, w.org, { role: 'facility' })
      await expect(
        w
          .as(facility.user)
          .land.documents.link({ versionId: doc.version.id, disposition: 'attachment' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }))
})

describe('land.documents review fixes', () => {
  it('refuses a separate document under a name the type already uses', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const receipt = (name: string) =>
        w.file().then((fileId) =>
          w.client.land.documents.upload({
            parcelId: parcel.id,
            type: 'family_receipt',
            name,
            separate: true,
            fileId,
          }),
        )
      await receipt('Adeyemi family')
      await expect(receipt('adeyemi FAMILY')).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'document_name_taken' },
        message:
          "There's already a family receipt called Adeyemi family. Use another name or upload it as a new version.",
      })
    }))

  it('caps a parcel at 200 documents, still taking new versions of them', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await tx.execute(sql`
        insert into title_documents (organization_id, parcel_id, type, name, created_by_user_id)
        select ${w.org.id}, ${parcel.id}, 'other', 'Letter ' || n, ${w.ngozi.user.id}
        from generate_series(1, ${MAX_DOCUMENTS_PER_PARCEL}) n`)
      const upload = async (name: string) =>
        w.client.land.documents.upload({
          parcelId: parcel.id,
          type: 'other',
          name,
          fileId: await w.file(),
        })
      await expect(upload('Query letter')).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'too_many_documents' },
      })
      expect((await upload('Letter 7')).version.versionNo).toBe(1)
    }))

  it('opens a removed version only for people who can remove documents, auditing nothing else', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const removed = await createTitleDocument(tx, w.org, parcel, {
        type: 'survey_plan',
        storage: w.storage,
        removedReason: 'Wrong parcel',
      })
      const grace = await createMember(tx, w.org, { role: 'sales' })
      const link = { versionId: removed.version.id, disposition: 'attachment' } as const
      await expect(w.as(grace.user).land.documents.link(link)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      const [history] = await w.as(grace.user).land.documents.versions({
        documentId: removed.document.id,
      })
      expect(history?.removed).toMatchObject({ reason: 'Wrong parcel' })
      expect((await linkEvents(tx, parcel.id)).length).toBe(0)
      expect((await w.client.land.documents.link(link)).url).toContain(parcel.organizationId)
      expect((await linkEvents(tx, parcel.id)).length).toBe(1)
    }))

  it('limits links to 60 per person in 10 minutes, auditing no refusal', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const doc = await createTitleDocument(tx, w.org, parcel, {
        type: 'c_of_o',
        storage: w.storage,
      })
      const client = clientAs(tx, w.ngozi.user, { storage: w.storage, rateLimit: true }).client
      const link = () =>
        client.land.documents.link({ versionId: doc.version.id, disposition: 'inline' })
      for (let i = 0; i < 60; i++) await link()
      await expect(link()).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        data: { retryAfterSeconds: expect.any(Number) },
      })
      expect((await linkEvents(tx, parcel.id)).length).toBe(60)
    }))

  it('audits which stage an existing other document is attached to', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await w.client.land.documents.upload({
        parcelId: parcel.id,
        type: 'other',
        name: 'Query letter',
        fileId: await w.file(),
      })
      const stage = parcel.stageOf('c_of_o')
      await w.client.land.stages.update({
        id: stage.id,
        expectedVersion: 1,
        status: 'submitted',
        on: '2026-11-02',
        attachments: [{ fileId: await w.file(), type: 'other', name: 'Query letter' }],
      })
      const uploads = await tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.targetId, parcel.id),
            eq(auditEvents.action, 'land.document.uploaded'),
          ),
        )
        .orderBy(auditEvents.createdAt, auditEvents.id)
      expect(uploads.map((u) => u.metadata)).toEqual([
        expect.not.objectContaining({ stageId: expect.anything() }),
        expect.objectContaining({ stageId: stage.id, stageType: 'c_of_o', versionNo: 2 }),
      ])
    }))
})

function linkEvents(tx: DbOrTx, parcelId: string) {
  return tx
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.targetId, parcelId), eq(auditEvents.action, 'land.document.link_issued')),
    )
}
