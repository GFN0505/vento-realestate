import { type DbOrTx, db } from '@/db/client'

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back, so tests never see each other's rows. */
export async function withRollback(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

let counter = 0
/** A unique lower-case email per call, for tests that commit (auth flows). */
export function uniqueEmail(name = 'person'): string {
  counter += 1
  return `${name}.${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}@test.vento.ng`
}
