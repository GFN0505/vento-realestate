import { recordEncumbranceInput } from '@vento/shared'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { decide } from '@/approvals/engine'
import { approvalPlugins } from '@/approvals/registry'
import { db } from '@/db/client'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { createMemoryStorage, type MemoryStorage } from '@/storage/memory-driver'
import { uniqueSuffix } from '@/test/db'
import {
  contextFor,
  createEncumbrance,
  createEntity,
  createMember,
  createOrganization,
  createParcel,
  createReadyFile,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { recordEncumbrance } from './encumbrances.service'
import { addParcel, recordCaveat } from './land.test-world'
import { assertParcelsNotBlocked } from './sales-block'

/** Until another session waits for a lock on this parcel's row (the approval's execute). */
async function waitForParcelLockWaiter(parcelId: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const result = await db.execute<{ waiting: boolean }>(sql`
      select exists (select 1 from pg_stat_activity
        where wait_event_type = 'Lock' and state = 'active'
          and query ilike '%from "parcels"%for update%'
          and query not ilike '%pg_stat_activity%') as waiting`)
    if (result.rows[0]?.waiting) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`nobody waited for parcel ${parcelId}`)
}

// Real commits on separate pool connections: one transaction can't show two requests racing.
// Each test makes its own organization, so the rows it leaves behind never meet another test's.

async function freshOrg(storage: MemoryStorage = createMemoryStorage()) {
  const org = await createOrganization(db, { name: `Race land ${uniqueSuffix()}`.slice(0, 80) })
  const entity = await createEntity(db, org, { name: 'Lekki Pearl Estates Ltd' })
  const ngozi = await createMember(db, org, { role: 'land_legal', name: 'Ngozi Adeyemi' })
  const client = (user = ngozi.user, s: MemoryStorage = storage) =>
    clientAs(db, user, { storage: s, activeOrganizationId: org.id }).client
  return { org, entity, ngozi, client, storage }
}

/** A bucket whose copies wait until `release()`; `copying` settles when the first one starts. */
function slowCopies(storage: MemoryStorage) {
  let release = () => {}
  let started = () => {}
  const gate = new Promise<void>((r) => {
    release = r
  })
  const copying = new Promise<void>((r) => {
    started = r
  })
  const slowed: MemoryStorage = {
    ...storage,
    async copyObject(from, to) {
      started()
      await gate
      return storage.copyObject(from, to)
    },
  }
  return { slowed, copying, release }
}

const within = <T>(ms: number, p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms),
    ),
  ])

describe('land under concurrent requests', () => {
  it('gives parallel creates distinct references, with none lost or repeated', async () => {
    const w = await freshOrg()
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        w.client().land.parcels.create(addParcel(w.entity.id, { name: `Parcel ${i + 1}` })),
      ),
    )
    expect(created.map((p) => p.referenceNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('lets a create without documents through while another create’s file is still copying', async () => {
    const w = await freshOrg()
    const { slowed, copying, release } = slowCopies(w.storage)
    const file = await createReadyFile(db, w.org, { uploadedBy: w.ngozi.user, storage: w.storage })
    const withFile = w.client(w.ngozi.user, slowed).land.parcels.create(
      addParcel(w.entity.id, {
        name: 'Parcel with a plan',
        documents: [{ fileId: file.id, type: 'survey_plan' }],
      }),
    )
    await copying
    const plain = await within(
      5_000,
      w.client().land.parcels.create(addParcel(w.entity.id, { name: 'Parcel without files' })),
    )
    release()
    const planned = await withFile
    expect([plain.referenceNumber, planned.referenceNumber]).toEqual([1, 2])
    expect(planned.documents).toHaveLength(1)
  })

  it('reads a parcel’s page on the pool, its reads side by side', async () => {
    const w = await freshOrg()
    const parcel = await createParcel(db, w.org, { entityId: w.entity.id })
    const detail = await w.client().land.parcels.get({ id: parcel.id })
    expect(detail.stages.map((s) => s.type)).toEqual(['survey_plan', 'excision_gazette', 'c_of_o'])
    expect(detail.documents).toEqual([])
  })

  it('lets one of two updates from the same version through and names its author to the other', async () => {
    const w = await freshOrg()
    const parcel = await createParcel(db, w.org, { entityId: w.entity.id })
    const id = parcel.stageOf('c_of_o').id
    const update = (user = w.ngozi.user) =>
      w
        .client(user)
        .land.stages.update({ id, expectedVersion: 1, status: 'submitted', on: '2026-11-02' })
    const results = await Promise.allSettled([update(), update(w.org.owner)])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect([fulfilled.length, rejected.length]).toEqual([1, 1])
    const winner = results[0]?.status === 'fulfilled' ? 'Ngozi Adeyemi' : 'Olumide Bankole'
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({
        code: 'CONFLICT',
        data: expect.objectContaining({ reason: 'stale', changedByName: winner }),
      }),
    })
  })

  it('makes a new encumbrance wait for a sale checking the block, then blocks the next one', async () => {
    const w = await freshOrg()
    const parcel = await createParcel(db, w.org, { entityId: w.entity.id, status: 'acquired' })
    const file = await createReadyFile(db, w.org, { uploadedBy: w.ngozi.user, storage: w.storage })
    let release = () => {}
    const held = new Promise<void>((r) => {
      release = r
    })
    let checked = () => {}
    const checking = new Promise<void>((r) => {
      checked = r
    })
    // A sale's transaction: checks the block (FOR SHARE on the parcel), then takes its time.
    const sale = db.transaction(async (tx) => {
      await assertParcelsNotBlocked(tx, { organizationId: w.org.id }, [parcel.id])
      checked()
      await held
    })
    await checking
    let recorded = false
    const record = w
      .client()
      .land.encumbrances.record(recordCaveat(parcel.id, file.id))
      .then((d) => {
        recorded = true
        return d
      })
    await new Promise((r) => setTimeout(r, 300))
    expect(recorded).toBe(false)
    release()
    await sale
    expect((await record).blocked).toBe(true)
    await expect(
      db.transaction((tx) =>
        assertParcelsNotBlocked(tx, { organizationId: w.org.id }, [parcel.id]),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'sales_blocked' } })
  })
  it('lets a last-step approval and a new encumbrance on the same parcel both finish (review #1)', async () => {
    // The order that deadlocked with FOR UPDATE on the organization (40P01): the recorder holds
    // the parcel; the approval takes the organization and waits for the parcel; then the
    // recorder inserts rows referencing the organization (FOR KEY SHARE). Arranged for certain
    // here: the recorder's transaction takes the parcel first and records only once the approval
    // is waiting on it.
    const w = await freshOrg()
    await seedDefaultRules(db, w.org.id, w.org.ownerMemberId)
    const aisha = await createMember(db, w.org, { role: 'finance', name: 'Aisha Bello' })
    const parcel = await createParcel(db, w.org, { entityId: w.entity.id, status: 'acquired' })
    const enc = await createEncumbrance(db, w.org, parcel, { recordedBy: w.ngozi.user })
    const file = () => createReadyFile(db, w.org, { uploadedBy: w.ngozi.user, storage: w.storage })
    const sent = await w.client().land.encumbrances.requestClear({
      id: enc.id,
      expectedVersion: 1,
      clearedOn: '2026-11-20',
      evidence: { fileId: (await file()).id },
      reason: 'Family withdrew the caveat',
    })
    const requestId = sent.pendingRequestId ?? ''
    const registry = approvalPlugins()
    await decide(
      await contextFor(db, aisha.user, w.org),
      { requestId, decision: 'approve' },
      registry,
    )
    const evidence = (await file()).id
    const ownerCtx = await contextFor(db, w.org.owner, w.org, w.storage)
    let holding = () => {}
    const held = new Promise<void>((r) => {
      holding = r
    })
    const recording = db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from parcels where id = ${parcel.id} for update`)
      holding()
      await waitForParcelLockWaiter(parcel.id)
      const ngozi = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      return recordEncumbrance(
        ngozi,
        recordEncumbranceInput.parse(
          recordCaveat(parcel.id, evidence, { type: 'lien', reference: 'LN/2026/9' }),
        ),
      )
    })
    await held
    const approving = decide(ownerCtx, { requestId, decision: 'approve' }, registry)
    const results = await within(15_000, Promise.allSettled([recording, approving]))
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    const detail = await w.client().land.parcels.get({ id: parcel.id })
    expect(detail.encumbrances.map((e) => [e.type, e.status])).toEqual([
      ['lien', 'active'],
      ['caveat', 'cleared'],
    ])
  })
})
