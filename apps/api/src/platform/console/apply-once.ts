import type { Done } from '@vento/shared/console'
import type { DbOrTx } from '@/db/client'
import { isUniqueViolation } from '@/lib/errors'
import { findByIdempotencyKey, type PlatformActor } from '../platform-audit'
import { PlatformError } from '../platform-error'
import type { ActiveSuperAdmin } from '../super-admins'
import { consoleActor } from './actor'

/**
 * Runs a console change at most once per idempotency key (admin-console plan §6.3). Every
 * operation writes exactly one platform audit row carrying the key, so the key's row is the
 * change: a retry by the same person gets the first answer back and nothing runs again; of two
 * identical requests at once, the second returns the first's answer.
 */
export async function applyOnce(
  db: DbOrTx,
  admin: Pick<ActiveSuperAdmin, 'userId' | 'name'>,
  idempotencyKey: string,
  run: (actor: PlatformActor) => Promise<string>,
): Promise<Done> {
  const replay = async (): Promise<Done | null> => {
    const previous = await findByIdempotencyKey(db, idempotencyKey)
    if (!previous) return null
    if (previous.actorUserId !== admin.userId) {
      throw new PlatformError('That change was already made from another session. Start again.')
    }
    return { message: previous.done }
  }
  const earlier = await replay()
  if (earlier) return earlier
  try {
    return { message: await run(consoleActor(admin, idempotencyKey)) }
  } catch (error) {
    // A twin request with the same key may have won: it holds the row lock first, so this one
    // reads the moved state ("stale", "already on that plan") or meets the unique index. Either
    // way the key's row now exists, and its answer is this request's answer too.
    if (
      error instanceof PlatformError ||
      isUniqueViolation(error, 'platform_audit_events_idempotency_unique')
    ) {
      const raced = await replay()
      if (raced) return raced
    }
    throw error
  }
}
