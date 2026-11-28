import { describe, expect, it } from 'vitest'
import { opensTitled, previewStages, stagesToSend } from './parcel-stages'

const types = (preview: ReturnType<typeof previewStages>) => preview.map((s) => s.type)

describe('the stages a new parcel starts with', () => {
  it('uses survey plan, excision gazette and C of O outside the FCT', () => {
    expect(types(previewStages('Lagos', null, []))).toEqual([
      'survey_plan',
      'excision_gazette',
      'c_of_o',
    ])
  })

  it('uses R of O instead of the gazette in the FCT', () => {
    expect(types(previewStages('FCT', null, []))).toEqual(['survey_plan', 'r_of_o', 'c_of_o'])
  })

  it('marks a stage granted when its document is dropped in', () => {
    const preview = previewStages('Lagos', null, ['c_of_o', 'family_receipt'])
    expect(preview.find((s) => s.type === 'c_of_o')?.granted).toBe(true)
    expect(preview.filter((s) => s.granted)).toHaveLength(1)
  })

  it("adds a document's stage that isn't in the list, in catalog order", () => {
    expect(types(previewStages('Lagos', null, ['governors_consent']))).toEqual([
      'survey_plan',
      'excision_gazette',
      'c_of_o',
      'governors_consent',
    ])
  })

  it('sends stages only when they differ from the state’s defaults', () => {
    expect(stagesToSend('Lagos', previewStages('Lagos', null, ['c_of_o']))).toBeUndefined()
    expect(stagesToSend('Lagos', previewStages('Lagos', ['c_of_o'], []))).toEqual(['c_of_o'])
  })

  it('opens as titled only when acquired and every stage has its document', () => {
    const all = previewStages('Lagos', ['c_of_o'], ['c_of_o'])
    expect(opensTitled('acquired', all)).toBe(true)
    expect(opensTitled('under_acquisition', all)).toBe(false)
    expect(opensTitled('acquired', previewStages('Lagos', null, ['c_of_o']))).toBe(false)
  })
})
