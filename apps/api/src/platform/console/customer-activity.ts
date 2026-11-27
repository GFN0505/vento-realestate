import type { CustomerActivityKind, FeedRow } from '@vento/shared/console'
import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

// The customer activity feed (admin-console plan §1b.9): notable account events from customers'
// own audit trails, grouped per organization, kind and Lagos day. Facts only: the query selects
// organization id and name, action, counts and times, never actor names, target labels, IPs or
// devices (NDPA; a deeper look is the consented support view).

/** The audit actions the feed shows, and the words each becomes. */
export const FEED_ACTIONS: Record<string, CustomerActivityKind> = {
  'organization.created': 'signed_up',
  'entity.created': 'added_company',
  'invitation.accepted': 'people_joined',
  'member.removed': 'people_removed',
  'member.access_changed': 'new_owner',
  'two_step.reset': 'two_step_reset',
  'auth.locked_out': 'sign_in_locked',
  'passkey.suspected_clone': 'possible_copied_passkey',
}

/** Internal organizations are Vento Real Estate's own: never in cross-customer numbers. */
export const NOT_INTERNAL = sql`coalesce(op.release_group, 'standard') <> 'internal'`

type Raw = {
  organization_id: string
  name: string
  action: string
  day: string
  n: number
  latest_at: Date | string
}

/**
 * Newest first. `organizationId` = one organization's card (its own feed, internal or not);
 * otherwise every customer organization except internal ones.
 */
export async function customerFeed(
  db: DbOrTx,
  input: { since: Date; limit: number; organizationId?: string },
): Promise<FeedRow[]> {
  const actions = sql.join(
    Object.keys(FEED_ACTIONS).map((a) => sql`${a}`),
    sql`, `,
  )
  const scope = input.organizationId
    ? sql`a.organization_id = ${input.organizationId}::uuid`
    : NOT_INTERNAL
  const result = await db.execute<Raw>(sql`
    select a.organization_id, o.name, a.action,
           to_char((a.created_at at time zone 'Africa/Lagos')::date, 'YYYY-MM-DD') as day,
           count(*)::int as n, max(a.created_at) as latest_at
    from audit_events a
    join organizations o on o.id = a.organization_id
    left join organization_plans op on op.organization_id = a.organization_id
    where a.created_at >= ${input.since.toISOString()}::timestamptz
      and a.action in (${actions})
      and (a.action <> 'member.access_changed' or a.metadata->>'roleKey' = 'owner')
      and ${scope}
    group by 1, 2, 3, 4
    order by latest_at desc, 1
    limit ${input.limit}`)
  return result.rows.flatMap((r) => {
    const kind = FEED_ACTIONS[r.action]
    if (!kind) return []
    return [
      {
        organization: { id: r.organization_id, name: r.name },
        kind,
        day: r.day,
        count: Number(r.n),
        latestAt: new Date(r.latest_at).toISOString(),
      },
    ]
  })
}
