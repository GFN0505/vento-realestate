import { describe, expect, it } from 'vitest'
import { companiesListInput, validateCompaniesSearch } from './companies-search'

describe('companies address', () => {
  it('keeps the Archived chip, a trimmed search and a real page', () => {
    expect(validateCompaniesSearch({ show: 'archived', q: '  Parkview ', page: '2' })).toEqual({
      show: 'archived',
      q: 'Parkview',
      page: 2,
    })
  })

  it('ignores anything a hand-edited link gets wrong', () => {
    expect(validateCompaniesSearch({ show: 'deleted', q: '   ', page: '-3' })).toEqual({
      show: undefined,
      q: undefined,
      page: undefined,
    })
  })

  it('asks for active companies, 50 a page, unless the address says otherwise', () => {
    expect(companiesListInput({})).toEqual({
      status: 'active',
      q: undefined,
      page: 1,
      pageSize: 50,
    })
  })
})
