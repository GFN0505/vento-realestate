import type { ParcelDetail } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { parcelValues, updateInputFrom } from './parcel-values'

const parcel = {
  id: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  version: 3,
  name: 'Plot 22, Folu Ayo',
  state: 'Lagos',
  lga: 'Ibeju-Lekki',
  area: null,
  sizeSqm: '7776.00',
  sizeUnit: 'plots',
  sizeEntered: '12.0000',
  plotSizeSqm: '648.00',
  status: 'titled',
  entity: { id: 'e', name: 'Lekki Pearl Estates Ltd', archived: false },
  acquisition: { cost: '840000000.00', currency: 'NGN', on: '2025-03-14' },
  seller: null,
  notes: null,
} as unknown as ParcelDetail

describe('Edit parcel values', () => {
  it('shows stored numbers as a person would type them, and titled as acquired', () => {
    const values = parcelValues(parcel)
    expect(values.size).toEqual({ value: '12', unit: 'plots', plotSizeSqm: '648' })
    expect(values.acquisitionCost).toBe('840000000')
    expect(values.status).toBe('acquired')
  })

  it('sends only what changed, with the version it was loaded at', () => {
    const values = { ...parcelValues(parcel), notes: 'Fenced in October' }
    expect(updateInputFrom(parcel, values, { notes: true })).toEqual({
      id: parcel.id,
      expectedVersion: 3,
      notes: 'Fenced in October',
    })
  })

  it('sends the state and the LGA together, so the LGA is checked against its state', () => {
    const values = { ...parcelValues(parcel), lga: 'Epe' }
    expect(updateInputFrom(parcel, values, { lga: true })).toMatchObject({
      state: 'Lagos',
      lga: 'Epe',
    })
  })

  it('clears an acquisition cost that was emptied', () => {
    const values = { ...parcelValues(parcel), acquisitionCost: '' }
    expect(updateInputFrom(parcel, values, { acquisitionCost: true }).acquisitionCost).toBeNull()
  })
})
