import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  parcels,
  recordCounters,
  titleDocuments,
  titleDocumentVersions,
  titleStages,
} from '@/db/schema'
import { type GuardName, isGuardViolation } from '@/lib/errors'
import { truncateGuardedTables, withRollback } from '@/test/db'
import { createOrganization, createParcel, createTitleDocument } from '@/test/factories'

// The 0021 triggers: title history is kept even against a write that skips the services.

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
          'parcels',
          'record_counters',
          'title_document_versions',
          'title_documents',
          'title_stages',
        ]),
      )
    }))
})
