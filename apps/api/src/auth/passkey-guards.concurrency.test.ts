import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db, pool } from '@/db/client'
import { passkeys, users } from '@/db/schema'
import { createUser } from '@/test/factories'

// Real concurrency, so these commit: an admin's two-step reset racing a passkey registration.

const passkeyRow = (userId: string, n: number) => ({
  userId,
  publicKey: 'x',
  credentialID: `race-${userId}-${n}`,
  counter: 0,
  deviceType: 'singleDevice',
  backedUp: false,
})

describe('a two-step reset racing a passkey registration', () => {
  it('makes a registration that waited on the reset fail, so no passkey survives', async () => {
    const user = await createUser(db)
    const reset = await pool.connect()
    try {
      await reset.query('begin')
      // What resetMemberTwoStep does first: the per-person lock, then the flags.
      await reset.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [user.id])
      await reset.query('delete from passkeys where user_id = $1', [user.id])
      await reset.query(
        'update users set password_reset_required = true, two_step_setup_required = true where id = $1',
        [user.id],
      )
      const registration = db.insert(passkeys).values(passkeyRow(user.id, 1))
      const outcome = registration.then(
        () => 'inserted',
        (error: { cause?: { message?: string } }) => error.cause?.message,
      )
      await new Promise((r) => setTimeout(r, 100))
      await reset.query('commit')
      expect(await outcome).toBe('PASSKEY_RESET_PENDING')
    } finally {
      reset.release()
    }
    expect(await db.select().from(passkeys).where(eq(passkeys.userId, user.id))).toEqual([])
  })

  it('lets a registration that landed first be deleted by the reset', async () => {
    const user = await createUser(db)
    await db.insert(passkeys).values(passkeyRow(user.id, 1))
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.id}::text, 0))`)
      await tx.delete(passkeys).where(eq(passkeys.userId, user.id))
      await tx.update(users).set({ passwordResetRequired: true }).where(eq(users.id, user.id))
    })
    expect(await db.select().from(passkeys).where(eq(passkeys.userId, user.id))).toEqual([])
    await expect(db.insert(passkeys).values(passkeyRow(user.id, 2))).rejects.toMatchObject({
      cause: { message: 'PASSKEY_RESET_PENDING' },
    })
  })
})
