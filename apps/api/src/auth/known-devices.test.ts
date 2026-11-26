import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { knownDevices } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createUser } from '@/test/factories'
import { deviceHash, recordDevice } from './known-devices'

const DAY = 24 * 3600_000

describe('known devices', () => {
  it('is new the first time, known after, and stores only a hash of the cookie', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      expect(await recordDevice(tx, user.id, 'cookie-value')).toEqual({ isNew: true })
      expect(await recordDevice(tx, user.id, 'cookie-value')).toEqual({ isNew: false })
      const rows = await tx.select().from(knownDevices).where(eq(knownDevices.userId, user.id))
      expect(rows.map((r) => r.deviceHash)).toEqual([deviceHash('cookie-value')])
      expect(JSON.stringify(rows)).not.toContain('cookie-value')
    }))

  it('counts a browser unseen for 90 days as new again, and prunes old rows', () =>
    withRollback(async (tx) => {
      const user = await createUser(tx)
      const longAgo = new Date(Date.now() - 91 * DAY)
      await recordDevice(tx, user.id, 'old-laptop', longAgo)
      await recordDevice(tx, user.id, 'stale-phone', longAgo)
      expect(await recordDevice(tx, user.id, 'old-laptop')).toEqual({ isNew: true })
      const rows = await tx.select().from(knownDevices).where(eq(knownDevices.userId, user.id))
      expect(rows.map((r) => r.deviceHash)).toEqual([deviceHash('old-laptop')])
    }))
})
