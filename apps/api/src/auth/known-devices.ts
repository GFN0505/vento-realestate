import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { knownDevices } from '@/db/schema'
import { KNOWN_DEVICE_TTL_MS } from './policy'

// A browser is recognised by Vento's own random cookie (no fingerprinting); only its hash is
// stored, so a database leak can't be replayed as a "known" browser.

/** 32 random bytes, base64url: the device cookie's value. */
export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url')
}

export function deviceHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Records that this browser signed in to the person's account. Returns true when it's new: never
 * seen, or not seen for 90 days. Also prunes the person's rows unseen for 90 days.
 */
export async function recordDevice(
  db: DbOrTx,
  userId: string,
  token: string,
  now = new Date(),
): Promise<{ isNew: boolean }> {
  const cutoff = new Date(now.getTime() - KNOWN_DEVICE_TTL_MS)
  const hash = deviceHash(token)
  const [seen] = await db
    .update(knownDevices)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(knownDevices.userId, userId),
        eq(knownDevices.deviceHash, hash),
        gt(knownDevices.lastSeenAt, cutoff),
      ),
    )
    .returning({ id: knownDevices.id })
  await db
    .delete(knownDevices)
    .where(and(eq(knownDevices.userId, userId), lt(knownDevices.lastSeenAt, cutoff)))
  if (seen) return { isNew: false }
  await db
    .insert(knownDevices)
    .values({ userId, deviceHash: hash, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [knownDevices.userId, knownDevices.deviceHash],
      set: { lastSeenAt: now, firstSeenAt: sql`excluded.first_seen_at` },
    })
  return { isNew: true }
}
