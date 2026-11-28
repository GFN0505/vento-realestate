import { describe, expect, it } from 'vitest'
import { isFiltered, nextSort, parcelsListInput, validateParcelsSearch } from './parcels-search'

const COMPANY = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

describe('parcels address', () => {
  it('keeps a chip, a trimmed search, a sort, a page and the Add parcel sheet', () => {
    expect(
      validateParcelsSearch({
        filter: 'titled',
        q: '  Lekki ',
        sort: 'size',
        dir: 'desc',
        page: '2',
        sheet: 'add',
      }),
    ).toEqual({ filter: 'titled', q: 'Lekki', sort: 'size', dir: 'desc', page: 2, sheet: 'add' })
  })

  it('ignores anything a hand-edited link gets wrong, and keeps the defaults bare', () => {
    expect(
      validateParcelsSearch({ filter: 'encumbered', q: '  ', sort: 'name', dir: 'up', page: '0' }),
    ).toEqual({
      filter: undefined,
      q: undefined,
      sort: undefined,
      dir: undefined,
      page: undefined,
      sheet: undefined,
    })
  })

  it('asks for all parcels A–Z, 25 a page, in the switcher’s company', () => {
    expect(parcelsListInput({ entity: COMPANY })).toEqual({
      q: undefined,
      filter: 'all',
      sort: 'name',
      dir: 'asc',
      page: 1,
      pageSize: 25,
      entityId: COMPANY,
    })
  })

  it('drops a company id that is not one', () => {
    expect(parcelsListInput({ entity: 'lekki' }).entityId).toBeUndefined()
  })

  it('counts a search or a chip as filtered, never the sort', () => {
    expect(isFiltered({ q: 'idu' })).toBe(true)
    expect(isFiltered({ filter: 'archived' })).toBe(true)
    expect(isFiltered({ sort: 'size', dir: 'desc' })).toBe(false)
  })

  it('flips the direction of the sorted column and starts a new one ascending', () => {
    expect(nextSort({}, 'name')).toEqual({ sort: undefined, dir: 'desc', page: undefined })
    expect(nextSort({ sort: 'size' }, 'size')).toEqual({
      sort: 'size',
      dir: 'desc',
      page: undefined,
    })
    expect(nextSort({ sort: 'size', dir: 'desc' }, 'size')).toEqual({
      sort: 'size',
      dir: undefined,
      page: undefined,
    })
    expect(nextSort({ sort: 'size', dir: 'desc' }, 'name')).toEqual({
      sort: undefined,
      dir: undefined,
      page: undefined,
    })
  })
})
