import { ENCUMBRANCE_TYPES } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { createEncumbrance, createOrganization, createParcel } from '@/test/factories'
import { assertParcelsNotBlocked, blockedParcels } from './sales-block'

// The sales block (decision 0027), the rule Projects and Sales will call: proved here at the API,
// not only in the UI (spec success criterion).

describe('the sales block', () => {
  it.each(ENCUMBRANCE_TYPES.filter((t) => t !== 'mortgage'))('blocks a parcel with a %s', (type) =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parcel = await createParcel(tx, org)
      await createEncumbrance(tx, org, parcel, { type, reference: 'FHC/L/CS/1182/2026' })
      expect(
        (await blockedParcels(tx, { organizationId: org.id }, [parcel.id])).get(parcel.id),
      ).toEqual({ type, reference: 'FHC/L/CS/1182/2026', others: 0 })
    }),
  )

  it('blocks for a mortgage only when chosen, and never once cleared', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const [chosen, notChosen, cleared] = [
        await createParcel(tx, org, { name: 'Chosen' }),
        await createParcel(tx, org, { name: 'Not chosen' }),
        await createParcel(tx, org, { name: 'Cleared' }),
      ]
      await createEncumbrance(tx, org, chosen, { type: 'mortgage', blocksSales: true })
      await createEncumbrance(tx, org, notChosen, { type: 'mortgage', blocksSales: false })
      await createEncumbrance(tx, org, cleared, { cleared: { on: '2026-11-20' } })
      const blocked = await blockedParcels(tx, { organizationId: org.id }, [
        chosen.id,
        notChosen.id,
        cleared.id,
      ])
      expect([...blocked.keys()]).toEqual([chosen.id])
    }))

  it('names the most serious blocking one and counts the rest', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parcel = await createParcel(tx, org)
      await createEncumbrance(tx, org, parcel, { type: 'mortgage', blocksSales: false })
      await createEncumbrance(tx, org, parcel, { type: 'lien', reference: null })
      await createEncumbrance(tx, org, parcel, { type: 'caveat', reference: 'CV/1' })
      expect(
        (await blockedParcels(tx, { organizationId: org.id }, [parcel.id])).get(parcel.id),
      ).toEqual({ type: 'caveat', reference: 'CV/1', others: 2 })
    }))

  it('never reads another organization’s parcels as blocked, nor ours through theirs', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx)
      const myParcel = await createParcel(tx, mine)
      const theirParcel = await createParcel(tx, theirs)
      await createEncumbrance(tx, theirs, theirParcel)
      const ctx = { organizationId: mine.id }
      expect((await blockedParcels(tx, ctx, [myParcel.id, theirParcel.id])).size).toBe(0)
      await expect(assertParcelsNotBlocked(tx, ctx, [myParcel.id])).resolves.toBeUndefined()
      // Review #6: an id that isn't ours is the caller's bug, never a sale let through unchecked.
      await expect(
        tx.transaction((sp) => assertParcelsNotBlocked(sp, ctx, [myParcel.id, theirParcel.id])),
      ).rejects.toThrow('a parcel id is not in this organization')
    }))

  it('refuses a new sale on a blocked parcel with the spec’s words', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const free = await createParcel(tx, org, { name: 'Epe farmland' })
      const parcel = await createParcel(tx, org)
      await createEncumbrance(tx, org, parcel, {
        type: 'court_order',
        reference: 'FHC/L/CS/1182/2026',
      })
      const ctx = { organizationId: org.id }
      await expect(assertParcelsNotBlocked(tx, ctx, [free.id])).resolves.toBeUndefined()
      await expect(assertParcelsNotBlocked(tx, ctx, [free.id, parcel.id])).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'sales_blocked' },
        message: 'Court order FHC/L/CS/1182/2026 blocks new sales on Plot 22, Folu Ayo.',
      })
    }))
})
