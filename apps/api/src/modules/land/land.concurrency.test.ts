import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { createMemoryStorage, type MemoryStorage } from '@/storage/memory-driver'
import { uniqueSuffix } from '@/test/db'
import {
  createEntity,
  createMember,
  createOrganization,
  createParcel,
  createReadyFile,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { addParcel } from './land.test-world'

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
})
