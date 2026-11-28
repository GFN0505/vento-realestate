import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  encumbrances,
  parcels,
  recordCounters,
  titleDocuments,
  titleDocumentVersions,
  titleStages,
} from '@/db/schema'
import { type GuardName, isGuardViolation } from '@/lib/errors'
import { truncateGuardedTables, withRollback } from '@/test/db'
import {
  createEncumbrance,
  createOrganization,
  createParcel,
  createTitleDocument,
} from '@/test/factories'

// The 0021 and 0023 triggers: title history and encumbrances are kept even against a write that
// skips the services.

const attempt = (tx: DbOrTx, run: (inner: DbOrTx) => Promise<unknown>) =>
  tx.transaction(async (inner) => void (await run(inner))).catch((e: unknown) => e)

async function setup(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const parcel = await createParcel(tx, org, {
    stages: [{ type: 'survey_plan', status: 'in_progress', statusOn: '2026-11-02' }, 'c_of_o'],
  })
  const doc = await createTitleDocument(tx, org, parcel, { type: 'survey_plan' })
  return { org, parcel, doc }
}

async function refused(tx: DbOrTx, guard: GuardName, run: (inner: DbOrTx) => Promise<unknown>) {
  expect(isGuardViolation(await attempt(tx, run), guard)).toBe(true)
}

describe('land guards', () => {
  it('keeps a document version: no delete, and only its removal can change', () =>
    withRollback(async (tx) => {
      const { doc } = await setup(tx)
      const v = eq(titleDocumentVersions.id, doc.version.id)
      const guard = 'title_document_versions_append_only'
      await refused(tx, guard, (i) => i.delete(titleDocumentVersions).where(v))
      await refused(tx, guard, (i) => i.update(titleDocumentVersions).set({ number: 'X' }).where(v))
      await refused(tx, guard, (i) =>
        i.update(titleDocumentVersions).set({ versionNo: 9 }).where(v),
      )
      const removed = await attempt(tx, (i) =>
        i
          .update(titleDocumentVersions)
          .set({
            removedAt: new Date(),
            removedByUserId: doc.version.uploadedByUserId,
            removedReason: 'Wrong parcel',
          })
          .where(v),
      )
      expect(removed).toBeUndefined()
    }))

  it('keeps a document on its parcel and its type', () =>
    withRollback(async (tx) => {
      const { doc } = await setup(tx)
      const d = eq(titleDocuments.id, doc.document.id)
      await refused(tx, 'title_documents_kept', (i) => i.delete(titleDocuments).where(d))
      await refused(tx, 'title_documents_kept', (i) =>
        i.update(titleDocuments).set({ type: 'c_of_o' }).where(d),
      )
    }))

  it('never deletes a parcel, nor a stage that has started', () =>
    withRollback(async (tx) => {
      const { parcel } = await setup(tx)
      await refused(tx, 'parcels_kept', (i) => i.delete(parcels).where(eq(parcels.id, parcel.id)))
      await refused(tx, 'title_stages_started_kept', (i) =>
        i.delete(titleStages).where(eq(titleStages.id, parcel.stageOf('survey_plan').id)),
      )
      const notStarted = await attempt(tx, (i) =>
        i.delete(titleStages).where(eq(titleStages.id, parcel.stageOf('c_of_o').id)),
      )
      expect(notStarted).toBeUndefined()
    }))

  it('keeps a stage on its parcel with its type', () =>
    withRollback(async (tx) => {
      const { org, parcel } = await setup(tx)
      const other = await createParcel(tx, org)
      const s = eq(titleStages.id, parcel.stageOf('c_of_o').id)
      await refused(tx, 'title_stages_fixed', (i) =>
        i.update(titleStages).set({ type: 'r_of_o' }).where(s),
      )
      await refused(tx, 'title_stages_fixed', (i) =>
        i.update(titleStages).set({ parcelId: other.id }).where(s),
      )
    }))

  it('only moves a record counter forward, and never deletes it', () =>
    withRollback(async (tx) => {
      const { org } = await setup(tx)
      const counter = and(
        eq(recordCounters.organizationId, org.id),
        eq(recordCounters.kind, 'parcel'),
      )
      const guard = 'record_counters_forward'
      await refused(tx, guard, (i) => i.update(recordCounters).set({ lastValue: 0 }).where(counter))
      await refused(tx, guard, (i) => i.delete(recordCounters).where(counter))
      const forward = await attempt(tx, (i) =>
        i.update(recordCounters).set({ lastValue: 50 }).where(counter),
      )
      expect(forward).toBeUndefined()
    }))

  it('has a BEFORE TRUNCATE guard on every table holding title history', () =>
    withRollback(async (tx) => {
      // Asserted from the catalog: running TRUNCATE takes ACCESS EXCLUSIVE locks that deadlock
      // with parallel test files (review).
      expect(await truncateGuardedTables(tx)).toEqual(
        expect.arrayContaining([
          'encumbrances',
          'parcels',
          'record_counters',
          'title_document_versions',
          'title_documents',
          'title_stages',
        ]),
      )
    }))

  it('never deletes an encumbrance, nor changes what it is or where it sits', () =>
    withRollback(async (tx) => {
      const { org, parcel } = await setup(tx)
      const other = await createParcel(tx, org, { name: 'Other plot' })
      const enc = await createEncumbrance(tx, org, parcel)
      const e = eq(encumbrances.id, enc.id)
      await refused(tx, 'encumbrances_kept', (i) => i.delete(encumbrances).where(e))
      await refused(tx, 'encumbrances_fixed', (i) =>
        i.update(encumbrances).set({ type: 'lien' }).where(e),
      )
      await refused(tx, 'encumbrances_fixed', (i) =>
        i.update(encumbrances).set({ blocksSales: false, type: 'mortgage' }).where(e),
      )
      await refused(tx, 'encumbrances_fixed', (i) =>
        i.update(encumbrances).set({ parcelId: other.id }).where(e),
      )
      const edit = await attempt(tx, (i) =>
        i.update(encumbrances).set({ nextOn: '2027-01-14' }).where(e),
      )
      expect(edit).toBeUndefined()
    }))

  it('freezes a cleared encumbrance: no edit and no way back to active', () =>
    withRollback(async (tx) => {
      const { org, parcel } = await setup(tx)
      const enc = await createEncumbrance(tx, org, parcel, { cleared: { on: '2026-11-20' } })
      const e = eq(encumbrances.id, enc.id)
      await refused(tx, 'encumbrances_cleared_frozen', (i) =>
        i.update(encumbrances).set({ notes: 'Reopened' }).where(e),
      )
      await refused(tx, 'encumbrances_cleared_frozen', (i) =>
        i
          .update(encumbrances)
          .set({
            status: 'active',
            clearedOn: null,
            clearanceDocumentId: null,
            clearedAt: null,
            clearedByUserId: null,
          })
          .where(e),
      )
    }))

  it('clears only through an approved request: a raw UPDATE or a cleared INSERT is refused', () =>
    withRollback(async (tx) => {
      const { org, parcel } = await setup(tx)
      const enc = await createEncumbrance(tx, org, parcel)
      const clearance = await createTitleDocument(tx, org, parcel, {
        type: 'encumbrance_evidence',
        name: 'Clearance · Caveat',
      })
      const cleared = {
        status: 'cleared' as const,
        clearedOn: '2026-11-20',
        clearanceDocumentId: clearance.document.id,
        clearanceVersionId: clearance.version.id,
        clearedAt: new Date(),
        clearedByUserId: org.owner.id,
      }
      await refused(tx, 'encumbrances_cleared_by_approval', (i) =>
        i.update(encumbrances).set(cleared).where(eq(encumbrances.id, enc.id)),
      )
      await refused(tx, 'encumbrances_cleared_by_approval', (i) =>
        i.insert(encumbrances).values({
          ...cleared,
          organizationId: org.id,
          parcelId: parcel.id,
          type: 'lien',
          blocksSales: true,
          claimant: 'First Bank',
          servedOn: '2026-11-01',
          evidenceDocumentId: enc.evidenceDocumentId,
          evidenceVersionId: enc.evidenceVersionId,
          recordedByUserId: org.owner.id,
        }),
      )
      const [row] = await tx.select().from(encumbrances).where(eq(encumbrances.id, enc.id))
      expect(row?.status).toBe('active')
    }))

  it('keeps the pinned evidence: never repointed, never removed from the vault', () =>
    withRollback(async (tx) => {
      const { org, parcel } = await setup(tx)
      const enc = await createEncumbrance(tx, org, parcel)
      const better = await createTitleDocument(tx, org, parcel, {
        type: 'encumbrance_evidence',
        name: 'Better scan',
      })
      await refused(tx, 'encumbrances_fixed', (i) =>
        i
          .update(encumbrances)
          .set({ evidenceDocumentId: better.document.id, evidenceVersionId: better.version.id })
          .where(eq(encumbrances.id, enc.id)),
      )
      await refused(tx, 'title_document_versions_pinned_kept', (i) =>
        i
          .update(titleDocumentVersions)
          .set({ removedAt: new Date(), removedByUserId: org.owner.id, removedReason: 'Blurry' })
          .where(eq(titleDocumentVersions.id, enc.evidenceVersionId)),
      )
    }))

  it('refuses recording on an archived parcel and archiving an encumbered one', () =>
    withRollback(async (tx) => {
      const { org, parcel } = await setup(tx)
      const archived = await createParcel(tx, org, { name: 'Archived plot', archived: true })
      await refused(tx, 'encumbrances_parcel_active', (i) => createEncumbrance(i, org, archived))
      await createEncumbrance(tx, org, parcel)
      await refused(tx, 'parcels_not_encumbered', (i) =>
        i
          .update(parcels)
          .set({ archivedAt: new Date(), archivedByUserId: org.owner.id })
          .where(eq(parcels.id, parcel.id)),
      )
    }))
})
