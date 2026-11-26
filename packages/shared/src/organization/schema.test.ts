import { describe, expect, it } from 'vitest'
import {
  createOrganizationInput,
  entityInput,
  listEntitiesInput,
  normaliseRcNumber,
  rcNumberWarning,
  tinWarning,
} from './schema'

describe('RC numbers', () => {
  it('normalises spacing, case and a missing prefix to one form', () => {
    expect(normaliseRcNumber('1789234')).toBe('RC 1789234')
    expect(normaliseRcNumber('rc1789234')).toBe('RC 1789234')
    expect(normaliseRcNumber(' RC-1789 234 ')).toBe('RC 1789234')
  })

  it('warns, without blocking, when it does not look like an RC number', () => {
    expect(rcNumberWarning('RC 1789234')).toBeNull()
    expect(rcNumberWarning('ABC')).toBe('RC numbers are digits, like RC 1789234')
    expect(rcNumberWarning('')).toBeNull()
  })
})

describe('TIN', () => {
  it('accepts the common formats and warns on others', () => {
    expect(tinWarning('12345678-0001')).toBeNull()
    expect(tinWarning('1234567890')).toBeNull()
    expect(tinWarning('12AB')).toBe('TINs are usually 10 digits, or like 12345678-0001')
  })
})

describe('entity input', () => {
  it('treats blank RC number and TIN as "add later"', () => {
    const parsed = entityInput.parse({
      name: 'Parkview Residences SPV Ltd',
      type: 'spv',
      rcNumber: ' ',
      tin: '',
    })
    expect(parsed).toMatchObject({ rcNumber: null, tin: null, vatRegistered: false })
  })

  it('rejects an organizationId sent by the browser', () => {
    const result = entityInput.safeParse({
      name: 'Parkview Residences SPV Ltd',
      type: 'spv',
      organizationId: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f',
    })
    expect(result.success).toBe(false)
  })
})

describe('organization input', () => {
  it('defaults the financial year to January and requires a real state', () => {
    expect(
      createOrganizationInput.parse({ name: 'Vento Homes Ltd', headOfficeState: 'Lagos' }),
    ).toEqual({
      name: 'Vento Homes Ltd',
      headOfficeState: 'Lagos',
      financialYearStartMonth: 1,
    })
    expect(
      createOrganizationInput.safeParse({ name: 'Vento', headOfficeState: 'Atlantis' }).success,
    ).toBe(false)
  })
})

describe('list entities input', () => {
  it('trims the search and pages by 25 unless asked', () => {
    expect(listEntitiesInput.parse({ q: '  Parkview ', status: 'archived' })).toEqual({
      q: 'Parkview',
      status: 'archived',
      page: 1,
      pageSize: 25,
    })
  })

  it('refuses unknown keys, such as an organizationId', () => {
    expect(
      listEntitiesInput.safeParse({ organizationId: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f' })
        .success,
    ).toBe(false)
  })
})
