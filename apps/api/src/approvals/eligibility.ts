import type { PermissionModule } from '@vento/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

// Who may approve a step (plan §5), as SQL, so the inbox, the count, the emails, the rules page's
// gaps and decide all use the same rule. Queries alias the member being judged as `m` and, when
// there is one, the request as `r`.

/** A uuid[] literal for a list of ids; an empty list is '{}' rather than a syntax error. */
export function uuidArray(ids: readonly string[]): SQL {
  if (ids.length === 0) return sql`'{}'::uuid[]`
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`
}

/** The facts the predicate needs, as SQL: columns of `r`, or values for a request not yet saved. */
export type StepTarget = {
  /** `m` holds one of the step's roles. */
  roleInStep: SQL
  module: SQL
  /** null for organization-wide actions. */
  entityId: SQL
  makerUserId: SQL
}

/** The current step of a saved request `r`. */
export const SAVED_REQUEST: StepTarget = {
  roleInStep: sql`exists (
    select 1 from approval_request_step_roles sr
    where sr.organization_id = r.organization_id and sr.request_id = r.id
      and sr.position = r.current_step and sr.role_id = m.role_id)`,
  module: sql`r.module`,
  entityId: sql`r.entity_id`,
  makerUserId: sql`r.maker_user_id`,
}

/** A step of a request about to be saved (or a rule's step, for the rules page). */
export function draftTarget(input: {
  roleIds: readonly string[]
  module: PermissionModule
  entityId: string | null
  makerUserId: string | null
}): StepTarget {
  return {
    roleInStep: sql`m.role_id = any(${uuidArray(input.roleIds)})`,
    module: sql`${input.module}::permission_module`,
    entityId: sql`${input.entityId}::uuid`,
    makerUserId: sql`${input.makerUserId}::uuid`,
  }
}

/**
 * An active member holding a role in the step, whose role has Approve in the module, whose
 * company access covers the request (organization-wide: no company limits at all), and who isn't
 * the maker. Being an owner gives no exemption. Exclusions and earlier decisions are separate, so
 * the detail can say why someone who sees a request can't decide it.
 */
export function couldApprove(t: StepTarget): SQL {
  return sql`(
    m.status = 'active'
    and ${t.roleInStep}
    and exists (
      select 1 from role_permissions rp
      where rp.organization_id = m.organization_id and rp.role_id = m.role_id
        and rp.module = ${t.module} and rp.action = 'approve')
    and (
      not exists (select 1 from member_entity_limits l where l.member_id = m.id)
      or (${t.entityId} is not null and exists (
        select 1 from member_entity_limits l
        where l.member_id = m.id and l.entity_id = ${t.entityId}))
    )
    and m.user_id is distinct from ${t.makerUserId}
  )`
}

/** `m` is excluded from the saved request `r` by its action. */
export const EXCLUDED = sql`(m.user_id = any(r.excluded_user_ids))`

/** `m` already decided a step of `r` (nobody decides two steps). */
export const DECIDED_EARLIER = sql`exists (
  select 1 from approval_decisions d where d.request_id = r.id and d.user_id = m.user_id)`

/** Eligible for the current step of `r` right now: the inbox, the count and decide. */
export const CAN_DECIDE = sql`(${couldApprove(SAVED_REQUEST)} and not ${EXCLUDED} and not ${DECIDED_EARLIER})`

/** A pending request still inside its 7 days. */
export const OPEN_REQUEST = sql`(r.status = 'pending' and r.expires_at > now())`

export type EligiblePerson = {
  memberId: string
  userId: string
  name: string
  email: string
  roleName: string
}

/** At most this many approvers are emailed per step (plan R7). */
export const MAX_APPROVER_EMAILS = 50

/** The people who can decide the current step of a saved request, A–Z, capped. */
export async function eligibleForRequest(
  db: DbOrTx,
  organizationId: string,
  requestId: string,
  limit = MAX_APPROVER_EMAILS,
): Promise<EligiblePerson[]> {
  const result = await db.execute<{
    member_id: string
    user_id: string
    name: string
    email: string
    role_name: string
  }>(sql`
    select m.id as member_id, u.id as user_id, u.name, u.email, ro.name as role_name
    from approval_requests r
    join members m on m.organization_id = r.organization_id
    join users u on u.id = m.user_id
    join roles ro on ro.id = m.role_id and ro.organization_id = m.organization_id
    where r.organization_id = ${organizationId} and r.id = ${requestId} and ${CAN_DECIDE}
    order by lower(u.name), m.id
    limit ${limit}
  `)
  return result.rows.map((row) => ({
    memberId: row.member_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    roleName: row.role_name,
  }))
}

/** How many people could decide a step of a request not yet saved, leaving out the excluded. */
export async function countEligibleDraft(
  db: DbOrTx,
  organizationId: string,
  target: StepTarget,
  excludedUserIds: readonly string[],
): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from members m
    where m.organization_id = ${organizationId} and ${couldApprove(target)}
      and not (m.user_id = any(${uuidArray(excludedUserIds)}))
  `)
  return result.rows[0]?.n ?? 0
}

/** Every non-empty set of step indexes of a chain (at most 3 steps, so at most 7 sets). */
export function stepSubsets(stepCount: number): number[][] {
  const subsets: number[][] = []
  for (let mask = 1; mask < 1 << stepCount; mask++) {
    subsets.push([...Array(stepCount).keys()].filter((i) => mask & (1 << i)))
  }
  return subsets.sort((a, b) => a.length - b.length)
}

/**
 * Whether a chain not yet saved can be finished: each step needs its own person, since nobody
 * decides two steps. By Hall's theorem that holds exactly when every set of k steps has at least k
 * eligible people between them, so an empty later step, or two Owner steps with one other owner,
 * is caught before a request is saved that would only stall (review S2). Returns the first step
 * that can't be filled, or null.
 */
export async function chainGap(
  db: DbOrTx,
  organizationId: string,
  chain: {
    steps: readonly (readonly string[])[]
    module: PermissionModule
    entityId: string | null
    makerUserId: string
  },
  excludedUserIds: readonly string[],
): Promise<number | null> {
  for (const subset of stepSubsets(chain.steps.length)) {
    const roleIds = [...new Set(subset.flatMap((i) => chain.steps[i] ?? []))]
    const eligible = await countEligibleDraft(
      db,
      organizationId,
      draftTarget({
        roleIds,
        module: chain.module,
        entityId: chain.entityId,
        makerUserId: chain.makerUserId,
      }),
      excludedUserIds,
    )
    if (eligible < subset.length) return (subset[0] ?? 0) + 1
  }
  return null
}

/** Another active owner than this person, whatever their company limits. */
export async function hasOtherActiveOwner(
  db: DbOrTx,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from members m
      join roles ro on ro.organization_id = m.organization_id and ro.id = m.role_id
      where m.organization_id = ${organizationId} and m.status = 'active'
        and ro.key = 'owner' and m.user_id <> ${userId}::uuid
    ) as found
  `)
  return result.rows[0]?.found === true
}

export type ViewerStanding = {
  isMaker: boolean
  couldApprove: boolean
  excluded: boolean
  /** Decided a step of it already (nobody decides two). */
  decided: boolean
}

/**
 * Where the viewer stands on one request, in one query, against their member row as it is now
 * (a role or company change applies at their next request). Null when the request isn't this
 * organization's.
 */
export async function viewerStanding(
  db: DbOrTx,
  organizationId: string,
  requestId: string,
  viewer: { memberId: string; userId: string },
): Promise<ViewerStanding | null> {
  const result = await db.execute<{
    is_maker: boolean
    could: boolean | null
    excluded: boolean | null
    decided: boolean
  }>(sql`
    select r.maker_user_id = ${viewer.userId}::uuid as is_maker,
      ${couldApprove(SAVED_REQUEST)} as could,
      ${EXCLUDED} as excluded,
      exists (select 1 from approval_decisions d
        where d.request_id = r.id and d.user_id = ${viewer.userId}::uuid) as decided
    from approval_requests r
    left join members m on m.id = ${viewer.memberId} and m.organization_id = r.organization_id
    where r.organization_id = ${organizationId} and r.id = ${requestId}
  `)
  const row = result.rows[0]
  if (!row) return null
  return {
    isMaker: row.is_maker,
    couldApprove: Boolean(row.could),
    excluded: Boolean(row.excluded),
    decided: row.decided,
  }
}
