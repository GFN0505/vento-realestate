import { createHash } from 'node:crypto'
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
  request: { path: string; input: { idempotencyKey: string } },
  run: (actor: PlatformActor) => Promise<string>,
): Promise<Done> {
  const idempotencyKey = request.input.idempotencyKey
  const fingerprint = requestFingerprint(request.path, request.input)
  const replay = async (): Promise<Done | null> => {
    const previous = await findByIdempotencyKey(db, idempotencyKey)
    if (!previous) return null
    if (previous.actorUserId !== admin.userId) {
      throw new PlatformError('That change was already made from another session. Start again.')
    }
    // The key belongs to one change: the same key with another change is a client bug (L2).
    if (previous.request && previous.request !== fingerprint) {
      throw new PlatformError('That change key was used for a different change. Start again.')
    }
    return { message: previous.done }
  }
  const earlier = await replay()
  if (earlier) return earlier
  try {
    return {
      message: await run({ ...consoleActor(admin, idempotencyKey), requestHash: fingerprint }),
    }
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

/** The procedure and its input (without the key), hashed: what one idempotency key stands for. */
export function requestFingerprint(path: string, input: { idempotencyKey: string }): string {
  const { idempotencyKey: _key, ...rest } = input
  return createHash('sha256')
    .update(`${path}\n${JSON.stringify(rest)}`)
    .digest('hex')
}
