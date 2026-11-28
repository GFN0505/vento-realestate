import { OTHER_ORGANIZATION_ACTOR } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents, parcels, titleStages } from '@/db/schema'
import { recordAudit } from '@/modules/audit/audit.service'
import { uniqueSuffix, withRollback } from '@/test/db'
import {
  createMember,
  createOrganization,
  createParcel,
  createTitleDocument,
} from '@/test/factories'
import { landWorld } from './land.test-world'
import { lagosToday } from './land-access'

const on = '2026-11-02'

describe('land.stages.update guards', () => {
  it('refuses granted without a document of the stage, with the spec copy', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await expect(
        w.client.land.stages.update({
          id: parcel.stageOf('c_of_o').id,
          expectedVersion: 1,
          status: 'granted',
          on,
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'granted_needs_document' },
        message: 'Attach the C of O to mark it granted.',
      })
    }))

  it('doesn’t count a removed version, or a document of another type, as evidence', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await createTitleDocument(tx, w.org, parcel, {
        type: 'c_of_o',
        removedReason: 'Wrong parcel',
      })
      await createTitleDocument(tx, w.org, parcel, { type: 'survey_plan' })
      await expect(
        w.client.land.stages.update({
          id: parcel.stageOf('c_of_o').id,
          expectedVersion: 1,
          status: 'granted',
          on,
        }),
      ).rejects.toMatchObject({ data: { reason: 'granted_needs_document' } })
    }))

  it('grants with a vault document, or one attached in the sheet that takes the reference and date', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await createTitleDocument(tx, w.org, parcel, { type: 'survey_plan' })
      const surveyed = await w.client.land.stages.update({
        id: parcel.stageOf('survey_plan').id,
        expectedVersion: 1,
        status: 'granted',
        on,
      })
      expect(surveyed.stages[0]).toMatchObject({ status: 'granted', statusOn: on, version: 2 })
      const detail = await w.client.land.stages.update({
        id: parcel.stageOf('c_of_o').id,
        expectedVersion: 1,
        status: 'granted',
        on,
        reference: 'LND/CO/2026/0412',
        attachments: [{ fileId: await w.file(), type: 'c_of_o' }],
      })
      const cOfO = detail.documents.find((d) => d.type === 'c_of_o')
      expect(cOfO?.latest).toMatchObject({ number: 'LND/CO/2026/0412', issuedOn: on, versionNo: 1 })
    }))

  it('needs what happened for queried and rejected, with the spec copy', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const id = parcel.stageOf('c_of_o').id
      await expect(
        w.client.land.stages.update({ id, expectedVersion: 1, status: 'queried', on }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: {
          issues: [expect.objectContaining({ message: 'Say what the registry asked for.' })],
        },
      })
      await expect(
        w.client.land.stages.update({ id, expectedVersion: 1, status: 'rejected', on }),
      ).rejects.toMatchObject({
        data: { issues: [expect.objectContaining({ message: 'Say why it was rejected.' })] },
      })
    }))

  it('needs what happened to leave granted', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2025-01-10' }],
      })
      await expect(
        w.client.land.stages.update({
          id: parcel.stageOf('c_of_o').id,
          expectedVersion: 1,
          status: 'submitted',
          on,
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'note_required' },
        message: 'Say what happened to the C of O.',
      })
    }))

  it('refuses a date after today in Lagos', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const tomorrow = new Date(Date.parse(`${lagosToday()}T12:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10)
      await expect(
        w.client.land.stages.update({
          id: parcel.stageOf('c_of_o').id,
          expectedVersion: 1,
          status: 'submitted',
          on: tomorrow,
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'future_date' },
        message: 'Enter a date on or before today.',
      })
      const today = await w.client.land.stages.update({
        id: parcel.stageOf('c_of_o').id,
        expectedVersion: 1,
        status: 'submitted',
        on: lagosToday(),
      })
      expect(today.stages[2]?.statusOn).toBe(lagosToday())
    }))

  it('keeps a follow-up date only while submitted or queried', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const id = parcel.stageOf('c_of_o').id
      const submitted = await w.client.land.stages.update({
        id,
        expectedVersion: 1,
        status: 'submitted',
        on,
        followUpOn: '2026-12-15',
      })
      expect(submitted.stages[2]?.followUpOn).toBe('2026-12-15')
      const moving = await w.client.land.stages.update({
        id,
        expectedVersion: 2,
        status: 'in_progress',
        on,
        followUpOn: '2026-12-15',
      })
      expect(moving.stages[2]?.followUpOn).toBeNull()
    }))

  it('needs Land & title create to attach a file in the sheet', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const editor = await createMember(tx, w.org, { role: 'land_legal' })
      await tx.execute(
        sql`delete from role_permissions where role_id = ${w.org.roleIds.get('land_legal')} and module = 'land' and action = 'create'`,
      )
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await expect(
        w.as(editor.user).land.stages.update({
          id: parcel.stageOf('c_of_o').id,
          expectedVersion: 1,
          status: 'submitted',
          on,
          attachments: [
            { fileId: await w.file(editor.user), type: 'other', name: 'Acknowledgement' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'permission' } })
    }))

  it('refuses a stale version and names who updated the stage', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const id = parcel.stageOf('c_of_o').id
      await w.client.land.stages.update({ id, expectedVersion: 1, status: 'in_progress', on })
      await expect(
        w.as(w.org.owner).land.stages.update({ id, expectedVersion: 1, status: 'submitted', on }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stale', changedByName: 'Ngozi Adeyemi' },
        message:
          'Ngozi Adeyemi updated this stage a moment ago. Check the latest, then save again.',
      })
    }))
})

describe('the parcel status follows its stages', () => {
  const grantAll = [
    { type: 'survey_plan', status: 'granted', statusOn: '2025-01-10' },
    { type: 'c_of_o', status: 'submitted', statusOn: '2026-10-10' },
  ] as const

  it('titles an acquired parcel when the last stage is granted, and audits it as automatic', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        status: 'acquired',
        stages: [...grantAll],
      })
      await createTitleDocument(tx, w.org, parcel, { type: 'c_of_o' })
      const detail = await w.client.land.stages.update({
        id: parcel.stageOf('c_of_o').id,
        expectedVersion: 1,
        status: 'granted',
        on,
      })
      expect(detail).toMatchObject({ status: 'titled', version: 2, currentStage: null })
      const [auto] = await tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.targetId, parcel.id), eq(auditEvents.action, 'land.parcel.updated')),
        )
      expect(auto?.metadata).toMatchObject({ automatic: 'titled' })
    }))

  it('takes a titled parcel back to acquired when a stage leaves granted', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        status: 'titled',
        stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2025-01-10' }],
      })
      const detail = await w.client.land.stages.update({
        id: parcel.stageOf('c_of_o').id,
        expectedVersion: 1,
        status: 'queried',
        on,
        note: 'Registry asked for the survey again',
      })
      expect(detail.status).toBe('acquired')
    }))

  it('never titles a prospect, and never touches a parcel in development', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      for (const status of ['prospect', 'under_acquisition', 'in_development'] as const) {
        const parcel = await createParcel(tx, w.org, {
          entityId: w.lekki.id,
          status,
          stages: [...grantAll],
        })
        await createTitleDocument(tx, w.org, parcel, { type: 'c_of_o' })
        const detail = await w.client.land.stages.update({
          id: parcel.stageOf('c_of_o').id,
          expectedVersion: 1,
          status: 'granted',
          on,
        })
        expect(detail.status).toBe(status)
      }
    }))
})

describe('land.stages.undo', () => {
  it('puts back the caller’s own last update within two minutes', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        status: 'acquired',
        stages: ['c_of_o'],
      })
      await createTitleDocument(tx, w.org, parcel, { type: 'c_of_o' })
      const id = parcel.stageOf('c_of_o').id
      const granted = await w.client.land.stages.update({
        id,
        expectedVersion: 1,
        status: 'granted',
        on,
        reference: 'CO/1',
      })
      expect(granted.status).toBe('titled')
      expect(granted.stages[0]?.canUndo).toBe(true)
      const undone = await w.client.land.stages.undo({ id, expectedVersion: 2 })
      expect(undone).toMatchObject({
        status: 'acquired',
        stages: [
          { status: 'not_started', statusOn: null, reference: null, version: 3, canUndo: false },
        ],
      })
      const [last] = await tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.targetId, parcel.id),
            eq(auditEvents.action, 'land.title_stage.updated'),
          ),
        )
        .orderBy(sql`${auditEvents.id} desc`)
        .limit(1)
      expect(last?.metadata).toMatchObject({ undo: true, undoneStatus: 'granted' })
    }))

  it('refuses someone else’s update, an undo of an undo, and a late one', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const id = parcel.stageOf('c_of_o').id
      await w.client.land.stages.update({ id, expectedVersion: 1, status: 'submitted', on })
      const expired = {
        code: 'CONFLICT',
        data: { reason: 'undo_expired' },
        message: 'This update can no longer be undone. Update the stage again instead.',
      }
      await expect(
        w.as(w.org.owner).land.stages.undo({ id, expectedVersion: 2 }),
      ).rejects.toMatchObject(expired)
      await w.client.land.stages.undo({ id, expectedVersion: 2 })
      await expect(w.client.land.stages.undo({ id, expectedVersion: 3 })).rejects.toMatchObject(
        expired,
      )
      await w.client.land.stages.update({ id, expectedVersion: 3, status: 'submitted', on })
      await tx
        .update(titleStages)
        .set({ updatedAt: new Date(Date.now() - 121_000) })
        .where(eq(titleStages.id, id))
      await expect(w.client.land.stages.undo({ id, expectedVersion: 4 })).rejects.toMatchObject(
        expired,
      )
    }))

  it('has nothing to undo on a stage granted from Add parcel', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const created = await w.client.land.parcels.create({
        name: 'Plot 22, Folu Ayo',
        state: 'Lagos',
        lga: 'Ibeju-Lekki',
        size: { value: '4.2', unit: 'ha' },
        entityId: w.lekki.id,
        documents: [{ fileId: await w.file(), type: 'survey_plan' }],
      })
      const stage = created.stages[0]
      expect(stage).toMatchObject({ status: 'granted', canUndo: false })
      await expect(
        w.client.land.stages.undo({ id: stage?.id ?? '', expectedVersion: 1 }),
      ).rejects.toMatchObject({
        data: { reason: 'undo_expired' },
      })
    }))
})

describe('land.stages.set', () => {
  it('adds a stage in catalog order and takes a titled parcel back to acquired', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        status: 'titled',
        stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2025-01-10' }],
      })
      const detail = await w.client.land.stages.set({
        parcelId: parcel.id,
        expectedVersion: 1,
        types: ['governors_consent', 'c_of_o', 'deed_of_assignment'],
      })
      expect(detail.stages.map((s) => s.type)).toEqual([
        'c_of_o',
        'deed_of_assignment',
        'governors_consent',
      ])
      expect(detail).toMatchObject({ status: 'acquired', version: 3 })
    }))

  it('keeps a started stage and a documented one, naming it', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [
          { type: 'survey_plan', status: 'in_progress', statusOn: on },
          'excision_gazette',
          'c_of_o',
        ],
      })
      await expect(
        w.client.land.stages.set({ parcelId: parcel.id, expectedVersion: 1, types: ['c_of_o'] }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stage_started' },
        message: 'Survey plan has started, so it stays.',
      })
      await createTitleDocument(tx, w.org, parcel, { type: 'excision_gazette' })
      await expect(
        w.client.land.stages.set({
          parcelId: parcel.id,
          expectedVersion: 1,
          types: ['survey_plan', 'c_of_o'],
        }),
      ).rejects.toMatchObject({ message: 'Excision gazette has documents, so it stays.' })
      const kept = await w.client.land.stages.set({
        parcelId: parcel.id,
        expectedVersion: 1,
        types: ['survey_plan', 'excision_gazette'],
      })
      expect(kept.stages.map((s) => s.type)).toEqual(['survey_plan', 'excision_gazette'])
    }))

  it('keeps the last stage', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await expect(
        w.client.land.stages.set({ parcelId: parcel.id, expectedVersion: 1, types: [] }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { issues: [expect.objectContaining({ message: 'Keep at least one title stage' })] },
      })
    }))

  it('refuses a stale parcel version, naming who changed it', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await w.client.land.parcels.create({
        name: 'Epe farmland',
        state: 'Lagos',
        lga: 'Epe',
        size: { value: '20', unit: 'ha' },
        entityId: w.lekki.id,
      })
      await w.client.land.parcels.update({ id: parcel.id, expectedVersion: 1, notes: 'Fenced' })
      await expect(
        w
          .as(w.org.owner)
          .land.stages.set({ parcelId: parcel.id, expectedVersion: 1, types: ['c_of_o'] }),
      ).rejects.toMatchObject({ data: { reason: 'stale', changedByName: 'Ngozi Adeyemi' } })
    }))
})

describe('land.stages.set: document history', () => {
  it('keeps a stage whose only document is removed, saying it has document history', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const parcel = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: ['survey_plan', 'excision_gazette', 'c_of_o'],
      })
      await createTitleDocument(tx, w.org, parcel, {
        type: 'excision_gazette',
        removedReason: 'Wrong parcel',
      })
      await expect(
        w.client.land.stages.set({
          parcelId: parcel.id,
          expectedVersion: 1,
          types: ['survey_plan', 'c_of_o'],
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stage_started' },
        message: 'Excision gazette has document history, so it stays.',
      })
    }))
})

describe('names of people outside the organization', () => {
  it('never names an outsider as a stage’s last updater or in a stale refusal', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const other = await createOrganization(tx, { name: `Other Developer ${uniqueSuffix()}` })
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const stage = parcel.stageOf('c_of_o')
      await tx
        .update(titleStages)
        .set({ status: 'in_progress', statusOn: on, version: 2, updatedByUserId: other.owner.id })
        .where(eq(titleStages.id, stage.id))
      const detail = await w.client.land.parcels.get({ id: parcel.id })
      expect(detail.stages.find((s) => s.id === stage.id)?.updatedBy).toEqual({
        name: OTHER_ORGANIZATION_ACTOR,
      })
      await expect(
        w.client.land.stages.update({ id: stage.id, expectedVersion: 1, status: 'submitted', on }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'stale', changedByName: OTHER_ORGANIZATION_ACTOR },
      })
    }))

  it('never names an outsider as who last changed the parcel', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const other = await createOrganization(tx, { name: `Other Developer ${uniqueSuffix()}` })
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      await tx.update(parcels).set({ version: 2 }).where(eq(parcels.id, parcel.id))
      await recordAudit(tx, {
        organizationId: w.org.id,
        action: 'land.parcel.updated',
        actor: { userId: other.owner.id, name: other.owner.name },
        target: { type: 'parcel', id: parcel.id, label: parcel.name },
      })
      await expect(
        w.client.land.parcels.update({ id: parcel.id, expectedVersion: 1, notes: 'Fenced' }),
      ).rejects.toMatchObject({
        data: { reason: 'stale', changedByName: OTHER_ORGANIZATION_ACTOR },
      })
    }))
})
