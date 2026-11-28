import type { LandQueueItem } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { LAND_QUEUE_LIMIT, landQueueRows } from './land-queue'

const TODAY = '2026-11-28'

let n = 0
function item(overrides: Partial<LandQueueItem>): LandQueueItem {
  n += 1
  return {
    kind: 'query',
    parcelId: `0193a000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    parcelName: 'Plot 22, Folu Ayo',
    stageId: `0193b000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    stageType: 'governors_consent',
    due: '2026-11-03',
    days: 25,
    ...overrides,
  }
}

describe('Land & legal queue', () => {
  it("asks to answer the registry's query on the stage and parcel", () => {
    const [row] = landQueueRows([item({ kind: 'query' })], TODAY)
    expect(row).toMatchObject({
      title: "Answer the registry's query",
      meta: "Governor's consent, Plot 22, Folu Ayo",
      due: { text: 'Queried 3 Nov', tone: 'amber' },
      action: 'Update stage',
      stageType: 'governors_consent',
    })
  })

  it('asks for a follow-up today, and calls an older one late', () => {
    const rows = landQueueRows(
      [
        item({ kind: 'follow_up', due: TODAY, days: 0, parcelName: 'Plot 22' }),
        item({ kind: 'follow_up', due: '2026-11-25', days: 3, stageType: 'c_of_o' }),
      ],
      TODAY,
    )
    expect(rows.map((r) => [r.title, r.due.text, r.due.tone])).toEqual([
      ['Follow up C of O', 'Due 25 Nov', 'rose'],
      ["Follow up governor's consent", 'Today', 'amber'],
    ])
  })

  it('says how long a stage has had no movement', () => {
    const [row] = landQueueRows(
      [
        item({
          kind: 'stalled',
          stageType: 'c_of_o',
          parcelName: 'Idu family land',
          due: '2025-08-26',
          days: 94,
        }),
      ],
      TODAY,
    )
    expect(row).toMatchObject({
      title: 'No movement on C of O for 94 days',
      meta: 'Idu family land',
      due: { text: 'Since 26 Aug 2025', tone: 'rose', badge: 'Stalled' },
    })
  })

  it('sorts by due date, then a query before a follow-up before a stalled stage', () => {
    const rows = landQueueRows(
      [
        item({ kind: 'stalled', due: '2026-08-01', parcelName: 'C' }),
        item({ kind: 'follow_up', due: '2026-08-01', parcelName: 'B' }),
        item({ kind: 'query', due: '2026-09-01', parcelName: 'A' }),
        item({ kind: 'query', due: '2026-08-01', parcelName: 'D' }),
      ],
      TODAY,
    )
    expect(rows.map((r) => r.meta.split(', ').at(-1))).toEqual(['D', 'B', 'C', 'A'])
  })

  it('shows at most 20 items, each with its own key', () => {
    const many = Array.from({ length: 25 }, () => item({}))
    const rows = landQueueRows(many, TODAY)
    expect(rows).toHaveLength(LAND_QUEUE_LIMIT)
    expect(new Set(rows.map((r) => r.key)).size).toBe(LAND_QUEUE_LIMIT)
  })
})
