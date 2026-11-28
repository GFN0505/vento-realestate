import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { createOrganization } from '@/test/factories'
import { nextNumber, raiseCounter } from './counters'

describe('nextNumber', () => {
  it('counts 1, 2, 3 per organization and kind', () =>
    withRollback(async (tx) => {
      const a = await createOrganization(tx)
      const b = await createOrganization(tx, { name: 'Other Developer Ltd' })
      expect(await nextNumber(tx, a.id, 'parcel')).toBe(1)
      expect(await nextNumber(tx, a.id, 'parcel')).toBe(2)
      expect(await nextNumber(tx, b.id, 'parcel')).toBe(1)
      expect(await nextNumber(tx, a.id, 'parcel')).toBe(3)
    }))

  it('continues after a seed raised the counter, and never goes down', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await raiseCounter(tx, org.id, 'parcel', 21)
      await raiseCounter(tx, org.id, 'parcel', 5)
      expect(await nextNumber(tx, org.id, 'parcel')).toBe(22)
    }))
})
