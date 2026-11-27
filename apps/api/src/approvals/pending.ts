import { type ApprovalActionKey, type PendingApproval, stepText } from '@vento/shared'
import { sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { rawTimestamp } from '@/db/raw'
import { uuidArray } from './eligibility'
import { SYSTEM_ORDER } from './rules'

/**
 * The "Waiting for approval" status of records (the role page, Team rows), in one query: each
 * subject's open request with its current step's roles. Expired ones don't count.
 */
export async function pendingApprovals(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
  actionKey: ApprovalActionKey,
  subjectType: string,
  subjectIds: readonly string[],
): Promise<Map<string, PendingApproval>> {
  if (subjectIds.length === 0) return new Map()
  const result = await db.execute<{
    subject_id: string
    id: string
    created_at: Date | string
    maker_member_id: string
    roles: string[] | null
  }>(sql`
    select r.subject_id, r.id, r.created_at, r.maker_member_id,
      (select array_agg(ro.name order by array_position(${SYSTEM_ORDER}, ro.key) nulls last,
          lower(ro.name))
        from approval_request_step_roles sr
        join roles ro on ro.id = sr.role_id and ro.organization_id = sr.organization_id
        where sr.request_id = r.id and sr.position = r.current_step) as roles
    from approval_requests r
    where r.organization_id = ${ctx.organizationId} and r.action_key = ${actionKey}
      and r.subject_type = ${subjectType} and r.subject_id = any(${uuidArray(subjectIds)})
      and r.status = 'pending' and r.expires_at > now()`)
  return new Map(
    result.rows.map((r) => [
      r.subject_id,
      {
        requestId: r.id,
        waitingFor: stepText(r.roles ?? []),
        requestedAt: (rawTimestamp(r.created_at) ?? new Date(0)).toISOString(),
        isOwn: r.maker_member_id === ctx.member.id,
      },
    ]),
  )
}
