import { TITLE_STAGE_TYPES } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { STAGE_PARAM_VALUES, validateParcelSearch } from './parcel-search'

describe('a parcel’s address', () => {
  it('keeps the tab, the sheet and the stage the sheet opens on', () => {
    expect(validateParcelSearch({ tab: 'activity', sheet: 'stage', stage: 'c_of_o' })).toEqual({
      tab: 'activity',
      sheet: 'stage',
      stage: 'c_of_o',
      doc: undefined,
      preview: undefined,
      page: undefined,
    })
  })

  it('keeps the document a new version goes to, the open preview and the activity page', () => {
    const doc = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
    expect(validateParcelSearch({ sheet: 'upload', doc }).doc).toBe(doc)
    expect(validateParcelSearch({ sheet: 'edit', doc }).doc).toBeUndefined()
    expect(validateParcelSearch({ preview: doc, page: '3' })).toMatchObject({
      preview: doc,
      page: 3,
    })
    expect(validateParcelSearch({ preview: 'nope', page: '1' })).toMatchObject({
      preview: undefined,
      page: undefined,
    })
  })

  it('drops a stage without the stage sheet, and anything unknown', () => {
    expect(validateParcelSearch({ tab: 'map', sheet: 'edit', stage: 'c_of_o' })).toEqual({
      tab: undefined,
      sheet: 'edit',
      stage: undefined,
      doc: undefined,
      preview: undefined,
      page: undefined,
    })
    expect(validateParcelSearch({ sheet: 'stage', stage: 'deed' }).stage).toBeUndefined()
  })

  it('knows every stage in the catalog', () => {
    expect([...STAGE_PARAM_VALUES]).toEqual([...TITLE_STAGE_TYPES])
  })
})
