import { describe, expect, it } from 'vitest'
import {
  currentStageOf,
  defaultStagesFor,
  documentLabel,
  documentWord,
  likelyNextStatus,
  TITLE_DOCUMENTS,
  TITLE_STAGE_TYPES,
} from './catalog'
import { parcelReference, parseParcelReference } from './reference'
import { hectares, sizeText, toSqm } from './size'
import { resolveParcelStatus } from './status'

describe('defaultStagesFor', () => {
  it('starts with survey plan, excision gazette and C of O', () => {
    expect(defaultStagesFor('Lagos')).toEqual(['survey_plan', 'excision_gazette', 'c_of_o'])
    expect(defaultStagesFor('Ogun')).toEqual(['survey_plan', 'excision_gazette', 'c_of_o'])
  })

  it('uses R of O instead of the excision gazette in the FCT', () => {
    expect(defaultStagesFor('FCT')).toEqual(['survey_plan', 'r_of_o', 'c_of_o'])
  })
})

describe('the stage catalog', () => {
  it('puts the deed of assignment before the governor’s consent', () => {
    expect(TITLE_STAGE_TYPES.indexOf('deed_of_assignment')).toBeLessThan(
      TITLE_STAGE_TYPES.indexOf('governors_consent'),
    )
  })

  it('maps each stage’s document to the stage, and grants nothing for receipts or other', () => {
    for (const type of TITLE_STAGE_TYPES) expect(TITLE_DOCUMENTS[type].stageType).toBe(type)
    expect(TITLE_DOCUMENTS.family_receipt.stageType).toBeNull()
    expect(TITLE_DOCUMENTS.land_purchase_agreement.stageType).toBeNull()
    expect(TITLE_DOCUMENTS.other.stageType).toBeNull()
  })

  it('names documents in plain words', () => {
    expect(documentLabel('c_of_o', null)).toBe('C of O')
    expect(documentLabel('family_receipt', 'Adeyemi family')).toBe(
      'Family receipt · Adeyemi family',
    )
    expect(documentLabel('other', 'Query letter')).toBe('Query letter')
    expect(documentWord('survey_plan', null)).toBe('survey plan')
  })
})

describe('likelyNextStatus', () => {
  it('pre-selects submitted, then granted', () => {
    expect(likelyNextStatus('not_started')).toBe('submitted')
    expect(likelyNextStatus('in_progress')).toBe('submitted')
    expect(likelyNextStatus('submitted')).toBe('granted')
    expect(likelyNextStatus('queried')).toBe('granted')
    expect(likelyNextStatus('rejected')).toBe('submitted')
  })
})

describe('currentStageOf', () => {
  it('is the first stage in catalog order that is not granted', () => {
    const stages = [
      { type: 'c_of_o', status: 'in_progress' },
      { type: 'survey_plan', status: 'granted' },
      { type: 'excision_gazette', status: 'not_started' },
    ] as const
    expect(currentStageOf(stages)?.type).toBe('excision_gazette')
    expect(currentStageOf([{ type: 'c_of_o', status: 'granted' }] as const)).toBeNull()
  })
})

describe('resolveParcelStatus', () => {
  const granted = { status: 'granted' } as const
  const started = { status: 'in_progress' } as const

  it('titles an acquired parcel once every stage is granted', () => {
    expect(resolveParcelStatus('acquired', [granted, granted])).toBe('titled')
    expect(resolveParcelStatus('acquired', [granted, started])).toBe('acquired')
    expect(resolveParcelStatus('acquired', [])).toBe('acquired')
  })

  it('takes a titled parcel back to acquired when a stage leaves granted', () => {
    expect(resolveParcelStatus('titled', [granted, started])).toBe('acquired')
    expect(resolveParcelStatus('titled', [granted])).toBe('titled')
  })

  it('never titles a prospect or under-acquisition parcel, and leaves Projects’ statuses', () => {
    expect(resolveParcelStatus('prospect', [granted])).toBe('prospect')
    expect(resolveParcelStatus('under_acquisition', [granted])).toBe('under_acquisition')
    expect(resolveParcelStatus('in_development', [started])).toBe('in_development')
    expect(resolveParcelStatus('sold_out', [granted])).toBe('sold_out')
  })
})

describe('parcel references', () => {
  it('formats P-0012 and reads it back from what people type', () => {
    expect(parcelReference(12)).toBe('P-0012')
    expect(parcelReference(12345)).toBe('P-12345')
    expect(parseParcelReference('P-0012')).toBe(12)
    expect(parseParcelReference('p-12')).toBe(12)
    expect(parseParcelReference('12')).toBe(12)
    expect(parseParcelReference('Plot 22')).toBeNull()
    expect(parseParcelReference('0')).toBeNull()
  })
})

describe('sizes', () => {
  it('stores 12 plots with no plot size as 7,200 m² and reads it "12 plots (0.72 ha)"', () => {
    const sqm = toSqm({ value: '12', unit: 'plots' })
    expect(sqm).toBe('7200.00')
    expect(
      sizeText({ sizeSqm: sqm, sizeUnit: 'plots', sizeEntered: '12', plotSizeSqm: '600.00' }),
    ).toBe('12 plots (0.72 ha)')
  })

  it('reads a non-standard plot, hectares and square metres', () => {
    expect(toSqm({ value: '12', unit: 'plots', plotSizeSqm: '648' })).toBe('7776.00')
    expect(
      sizeText({ sizeSqm: '7776.00', sizeUnit: 'plots', sizeEntered: '12', plotSizeSqm: '648.00' }),
    ).toBe('12 plots of 648 m² (0.78 ha)')
    expect(toSqm({ value: '4.2', unit: 'ha' })).toBe('42000.00')
    expect(
      sizeText({ sizeSqm: '42000.00', sizeUnit: 'ha', sizeEntered: '4.2', plotSizeSqm: null }),
    ).toBe('4.20 ha')
    expect(
      sizeText({ sizeSqm: '1250.50', sizeUnit: 'sqm', sizeEntered: '1250.5', plotSizeSqm: null }),
    ).toBe('1,250.5 m² (0.13 ha)')
  })

  it('works in decimals, never floats', () => {
    expect(toSqm({ value: '0.0001', unit: 'ha' })).toBe('1.00')
    expect(toSqm({ value: '0.1', unit: 'ha' })).toBe('1000.00')
    expect(hectares('450000.00')).toBe('45.00')
  })
})
