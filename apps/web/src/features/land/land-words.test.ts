import { hectares } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  currentStageLine,
  hectaresText,
  lgaLine,
  parcelBadge,
  parcelsSummaryLine,
  stageStatusText,
} from './land-words'

describe('sizes on the list', () => {
  it.each(['42000.00', '7200.00', '450000.00', '0.01', '49.99', '50.00', '125.50', '0.00'])(
    'reads %s m² in hectares exactly as the shared rule does',
    (sqm) => {
      expect(hectaresText(sqm)).toBe(`${hectares(sqm)} ha`)
    },
  )

  it('groups thousands of hectares', () => {
    expect(hectaresText('123456789.00')).toBe('12,345.68 ha')
  })

  it('reads the subtitle from the summary', () => {
    expect(parcelsSummaryLine({ count: 6, totalSqm: '450000.00' })).toBe('6 parcels · 45.00 ha')
    expect(parcelsSummaryLine({ count: 1, totalSqm: '9000.00' })).toBe('1 parcel · 0.90 ha')
  })
})

describe('title stage words', () => {
  it('dates the stages that have a date, and says when a grant has none', () => {
    expect(stageStatusText('submitted', '2026-10-10')).toBe('Submitted 10 Oct 2026')
    expect(stageStatusText('granted', null)).toBe('Granted · date not recorded')
    expect(stageStatusText('in_progress', '2026-10-10')).toBe('In progress')
  })

  it('names the current stage, or says every stage is granted', () => {
    expect(
      currentStageLine({
        stagesTotal: 3,
        currentStage: { type: 'c_of_o', status: 'queried', statusOn: '2026-11-03' },
      }),
    ).toBe('C of O · Queried 3 Nov 2026')
    expect(currentStageLine({ stagesTotal: 3, currentStage: null })).toBe('All stages granted')
  })
})

describe('parcel words', () => {
  it('shows an archived parcel as archived, whatever its status', () => {
    expect(parcelBadge({ status: 'titled', archivedAt: null })).toEqual({
      label: 'Titled',
      tone: 'emerald',
    })
    expect(parcelBadge({ status: 'titled', archivedAt: '2026-11-20T10:00:00Z' }).label).toBe(
      'Archived',
    )
  })

  it('names LGAs, and the FCT’s area councils without "LGA"', () => {
    expect(lgaLine({ lga: 'Ibeju-Lekki', state: 'Lagos' })).toBe('Ibeju-Lekki LGA, Lagos')
    expect(lgaLine({ lga: 'Abuja Municipal', state: 'FCT' })).toBe('Abuja Municipal, FCT')
  })
})
