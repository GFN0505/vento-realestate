import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { contextFor, createMember, createOrganization, createParcel } from '@/test/factories'
import { landWorld } from './land.test-world'
import { lagosToday } from './land-access'
import { daysBetween, landHome, queueItemFor } from './land-home.service'

/** The Lagos date `n` days before today. */
const daysAgo = (n: number): string =>
  new Date(Date.parse(`${lagosToday()}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

describe('queueItemFor', () => {
  const today = '2026-11-28'
  const at = (days: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)

  it('calls a stage stalled from 90 days without movement, not at 89', () => {
    const stage = (days: number) => ({
      status: 'in_progress' as const,
      statusOn: at(days),
      followUpOn: null,
    })
    expect(queueItemFor(stage(89), today)).toBeNull()
    expect(queueItemFor(stage(90), today)).toEqual({ kind: 'stalled', due: at(90) })
    expect(queueItemFor(stage(91), today)).toEqual({ kind: 'stalled', due: at(91) })
  })

  it('lets a future follow-up date hold off stalled, and puts a due one in the queue', () => {
    expect(
      queueItemFor({ status: 'submitted', statusOn: at(120), followUpOn: '2026-12-10' }, today),
    ).toBeNull()
    expect(
      queueItemFor({ status: 'submitted', statusOn: at(120), followUpOn: today }, today),
    ).toEqual({
      kind: 'follow_up',
      due: today,
    })
  })

  it('puts a query first, dated by the query', () => {
    expect(queueItemFor({ status: 'queried', statusOn: at(3), followUpOn: at(1) }, today)).toEqual({
      kind: 'query',
      due: at(3),
    })
  })

  it('counts Lagos calendar days', () => {
    expect(daysBetween('2026-08-30', today)).toBe(90)
  })
})

describe('land.home', () => {
  it('counts titles in progress and stalled ones, by company', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [{ type: 'c_of_o', status: 'in_progress', statusOn: daysAgo(94) }],
      })
      await createParcel(tx, w.org, {
        entityId: w.parkview.id,
        name: 'Parkview Block B',
        stages: [{ type: 'c_of_o', status: 'submitted', statusOn: daysAgo(10) }],
      })
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        name: 'Epe farmland',
        status: 'prospect',
      })
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        name: 'Admiralty Way plot',
        status: 'titled',
        stages: [{ type: 'c_of_o', status: 'granted', statusOn: '2024-05-01' }],
      })
      const home = await w.client.land.home({})
      expect(home).toMatchObject({
        hasParcels: true,
        titledCount: 1,
        titlesInProgress: {
          count: 2,
          stalled: 1,
          byEntity: [
            { entityId: w.lekki.id, name: 'Lekki Pearl Estates Ltd', count: 1 },
            { entityId: w.parkview.id, name: 'Parkview Residences SPV Ltd', count: 1 },
          ],
        },
      })
      expect(home.pipeline.map((p) => [p.stageType, p.count])).toEqual([
        ['survey_plan', 1],
        ['c_of_o', 2],
      ])
      expect(home.pipeline[1]?.parcels[0]).toMatchObject({
        name: 'Plot 22, Folu Ayo',
        sinceDays: 94,
      })
    }))

  it('queues queries, due follow-ups and stalled stages by due date', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const idu = await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        name: 'Idu family land',
        state: 'FCT',
        stages: [
          {
            type: 'r_of_o',
            status: 'queried',
            statusOn: daysAgo(25),
            note: 'Registry asked for the consent letter',
          },
          { type: 'c_of_o', status: 'in_progress', statusOn: daysAgo(94) },
        ],
      })
      const parkview = await createParcel(tx, w.org, {
        entityId: w.parkview.id,
        name: 'Parkview Block B',
        stages: [
          { type: 'c_of_o', status: 'submitted', statusOn: daysAgo(40), followUpOn: daysAgo(1) },
        ],
      })
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        name: 'Calm plot',
        stages: [
          { type: 'c_of_o', status: 'submitted', statusOn: daysAgo(100), followUpOn: daysAgo(-5) },
        ],
      })
      const { queue } = await w.client.land.home({})
      expect(queue.map((q) => [q.kind, q.parcelName, q.stageType, q.days])).toEqual([
        ['stalled', 'Idu family land', 'c_of_o', 94],
        ['query', 'Idu family land', 'r_of_o', 25],
        ['follow_up', 'Parkview Block B', 'c_of_o', 1],
      ])
      expect(queue[2]).toMatchObject({
        parcelId: parkview.id,
        stageId: parkview.stageOf('c_of_o').id,
      })
      expect(queue[0]?.parcelId).toBe(idu.id)
    }))

  it('stops the queue at 20, oldest due first, counting every parcel in the tile', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      for (let i = 1; i <= 25; i++) {
        await createParcel(tx, w.org, {
          entityId: w.lekki.id,
          name: `Parcel ${String(i).padStart(2, '0')}`,
          stages: [{ type: 'c_of_o', status: 'queried', statusOn: daysAgo(i), note: 'Query' }],
        })
      }
      const home = await w.client.land.home({})
      expect(home.queue).toHaveLength(20)
      expect(home.queue[0]).toMatchObject({ parcelName: 'Parcel 25', days: 25 })
      expect(home.queue.at(-1)).toMatchObject({ parcelName: 'Parcel 06', days: 6 })
      expect(home.titlesInProgress.count).toBe(25)
      expect(home.pipeline).toEqual([
        expect.objectContaining({ stageType: 'c_of_o', count: 25, parcels: expect.any(Array) }),
      ])
      expect(home.pipeline[0]?.parcels.map((p) => p.name)).toEqual([
        'Parcel 25',
        'Parcel 24',
        'Parcel 23',
        'Parcel 22',
        'Parcel 21',
      ])
    }))

  it('shows the queue only to people who can edit Land & title', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [{ type: 'c_of_o', status: 'in_progress', statusOn: daysAgo(94) }],
      })
      const grace = await createMember(tx, w.org, { role: 'sales' })
      const home = await w.as(grace.user).land.home({})
      expect(home).toMatchObject({ queue: [], titlesInProgress: { count: 1, stalled: 1 } })
    }))

  it('follows the company filter and the member’s companies', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await createParcel(tx, w.org, {
        entityId: w.lekki.id,
        stages: [{ type: 'c_of_o', status: 'in_progress', statusOn: daysAgo(94) }],
      })
      await createParcel(tx, w.org, {
        entityId: w.parkview.id,
        name: 'Parkview Block B',
        stages: [{ type: 'c_of_o', status: 'submitted', statusOn: daysAgo(3) }],
      })
      expect(
        (await w.client.land.home({ entityId: w.parkview.id })).titlesInProgress,
      ).toMatchObject({ count: 1, stalled: 0 })
      const limited = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      const own = await w.as(limited.user).land.home({})
      expect(own.titlesInProgress.byEntity.map((e) => e.name)).toEqual([
        'Parkview Residences SPV Ltd',
      ])
      expect(own.queue).toEqual([])
      expect(await w.as(limited.user).land.home({ entityId: w.lekki.id })).toMatchObject({
        hasParcels: false,
        queue: [],
      })
    }))

  it('says there are no parcels yet', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const ctx = await contextFor(tx, w.ngozi.user, w.org)
      expect(await landHome(ctx, {})).toEqual({
        hasParcels: false,
        titlesInProgress: { count: 0, stalled: 0, byEntity: [] },
        pipeline: [],
        titledCount: 0,
        queue: [],
      })
    }))

  it('denies a role without Land & title', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const hr = await createMember(tx, w.org, { role: 'hr' })
      await expect(w.as(hr.user).land.home({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }))

  it('answers not found when Land & title isn’t available to the organization', () =>
    withRollback(async (tx) => {
      const starter = await createOrganization(tx, { planKey: 'starter' })
      const w = await landWorld(tx)
      await expect(w.as(starter.owner).land.home({})).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(w.as(starter.owner).land.parcels.list({})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))
})
