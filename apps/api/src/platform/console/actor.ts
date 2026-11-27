import { requestScope } from '@/lib/request-scope'
import type { PlatformActor } from '../platform-audit'
import type { ActiveSuperAdmin } from '../super-admins'

/**
 * The person making a console change, from the session: never typed. The operator names the
 * browser and masked network ("console · Chrome on Mac · 102.89.34.x"); the full IP is never kept.
 */
export function consoleActor(
  admin: Pick<ActiveSuperAdmin, 'userId' | 'name'>,
  idempotencyKey?: string,
): PlatformActor {
  const scope = requestScope()
  const device = scope.userAgentSummary ?? 'Unknown browser'
  const network = scope.ipMasked ?? 'unknown network'
  return {
    userId: admin.userId,
    name: admin.name,
    channel: 'console',
    operator: `console · ${device} · ${network}`,
    ...(idempotencyKey && { idempotencyKey }),
  }
}
