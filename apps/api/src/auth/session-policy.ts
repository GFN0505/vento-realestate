import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { sessions } from '@/db/schema'
import { LAST_ACTIVE_WRITE_INTERVAL_MS, SESSION_IDLE_MS, SESSION_MAX_MS } from './policy'

export type PolicySession = {
  id: string
  persistent: boolean
  createdAt: Date
  lastActiveAt: Date
}

export type SessionVerdict = 'expired' | 'touch' | 'ok'

/**
 * Better Auth only knows sliding expiry, so the spec's rule lives here: without "Keep me
 * signed in", 30 minutes idle or 12 hours after sign-in ends the session. Persistent sessions
 * simply run to their 30-day expiresAt, which Better Auth enforces itself.
 */
export function sessionVerdict(session: PolicySession, now: Date): SessionVerdict {
  const idle = now.getTime() - session.lastActiveAt.getTime()
  const age = now.getTime() - session.createdAt.getTime()
  if (!session.persistent && (idle > SESSION_IDLE_MS || age > SESSION_MAX_MS)) return 'expired'
  return idle > LAST_ACTIVE_WRITE_INTERVAL_MS ? 'touch' : 'ok'
}

/** Deletes an expired session (so every device sees it end) or records activity. */
export async function enforceSessionPolicy(
  db: DbOrTx,
  session: PolicySession,
  now = new Date(),
): Promise<'ok' | 'expired'> {
  const verdict = sessionVerdict(session, now)
  if (verdict === 'expired') {
    await db.delete(sessions).where(eq(sessions.id, session.id))
    return 'expired'
  }
  if (verdict === 'touch') {
    await db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, session.id))
  }
  return 'ok'
}
