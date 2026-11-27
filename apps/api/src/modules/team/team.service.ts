import {
  type EntityAccess,
  type EntityRef,
  emptyPermissionSet,
  type InvitationDelivery,
  type ListTeamOutput,
  type listTeamInput,
  type PendingApproval,
  type PermissionSet,
  type SystemRoleKey,
  type TeamInvitationRow,
  type TeamMemberRow,
  type TeamRemovedRow,
  type TeamRow,
  type TwoStepState,
} from '@vento/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ServiceContext } from '@/access/context'
import {
  invitationRowRights,
  type ManageViewer,
  memberRowRights,
  needsOwnerName,
  viewerOf,
} from '@/access/manage-rules'
import { firstOwner } from '@/access/who-can-grant'
import { pendingApprovals } from '@/approvals/pending'
import { INVITATION_QUEUED_STALE_MS } from '@/auth/policy'
import type { DbOrTx } from '@/db/client'
import { rawTimestamp } from '@/db/raw'
import { runQueries } from '@/db/run-queries'
import { likePattern } from '@/lib/like'
import { pageOffset, toPage } from '@/lib/paginate'
import { loadRoles } from '@/modules/roles/roles.service'

type RawRow = {
  kind: 'member' | 'invitation' | 'removed'
  id: string
  user_id: string | null
  name: string | null
  email: string
  role_id: string
  role_key: string | null
  role_name: string
  requires_two_step: boolean | null
  two_factor_enabled: boolean | null
  password_reset_required: boolean | null
  two_step_setup_required: boolean | null
  passkey_count: number | null
  joined_at: Date | string | null
  last_active_at: Date | string | null
  last_sent_at: Date | string | null
  expires_at: Date | string | null
  invited_by_name: string | null
  delivery: InvitationDelivery | null
  delivery_changed_at: Date | string | null
  removed_at: Date | string | null
  removed_by_name: string | null
}

type Filters = {
  q?: string
  roleId?: string
  ids?: readonly string[]
  /** The location switcher (decision 0014): people who can work in this entity. */
  entityId?: string
  /** The entity is outside the viewer's own limits: nothing matches. */
  none?: boolean
}

const idList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )

/**
 * Rows whose access covers the entity: all entities (no limit rows), a limit that includes it,
 * or `always` (owners). The entity must be this organization's, so a foreign id matches nobody.
 */
function coversEntity(
  organizationId: string,
  entityId: string,
  limits: { table: SQL; owner: SQL; id: SQL; always?: SQL },
): SQL {
  return sql`exists (select 1 from entities e where e.organization_id = ${organizationId}
      and e.id = ${entityId}::uuid)
    and (${limits.always ?? sql`false`}
      or not exists (select 1 from ${limits.table} l where l.${limits.owner} = ${limits.id})
      or exists (select 1 from ${limits.table} l where l.${limits.owner} = ${limits.id}
        and l.entity_id = ${entityId}::uuid))`
}

function filterSql(
  f: Filters,
  columns: { role: SQL; id: SQL; search: SQL[]; entity?: (entityId: string) => SQL },
): SQL {
  const parts: SQL[] = []
  if (f.none) parts.push(sql` and false`)
  if (f.entityId && columns.entity) parts.push(sql` and (${columns.entity(f.entityId)})`)
  if (f.roleId) parts.push(sql` and ${columns.role} = ${f.roleId}::uuid`)
  if (f.ids) parts.push(sql` and ${columns.id} in (${idList(f.ids)})`)
  if (f.q) {
    const pattern = likePattern(f.q)
    const any = sql.join(
      columns.search.map((c) => sql`${c} ilike ${pattern}`),
      sql` or `,
    )
    parts.push(sql` and (${any})`)
  }
  return sql.join(parts)
}

// The three parts share one column list so they can be unioned; each fills only its own.
function activeMembersSql(organizationId: string, f: Filters): SQL {
  return sql`
    select 'member'::text as kind, 0 as rank,
      (case when r.key = 'owner' then 0 else 1 end) as owner_rank, m.id, m.user_id, u.name, u.email,
      r.id as role_id, r.key as role_key, r.name as role_name,
      -- The role, or the organization's "Require two-step for everyone".
      (r.requires_two_step or o.two_step_required_for_everyone) as requires_two_step,
      u.two_factor_enabled, u.password_reset_required, u.two_step_setup_required,
      (select count(*) from passkeys p where p.user_id = m.user_id)::int as passkey_count,
      m.joined_at, m.last_active_at,
      null::timestamptz as last_sent_at, null::timestamptz as expires_at,
      null::text as invited_by_name, null::invitation_delivery as delivery,
      null::timestamptz as delivery_changed_at,
      null::timestamptz as removed_at, null::text as removed_by_name,
      lower(u.name) as sort_name
    from members m
    join users u on u.id = m.user_id
    join roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join organizations o on o.id = m.organization_id
    where m.organization_id = ${organizationId} and m.status = 'active'${filterSql(f, {
      role: sql`m.role_id`,
      id: sql`m.id`,
      search: [sql`u.name`, sql`u.email`],
      entity: (e) =>
        coversEntity(organizationId, e, {
          table: sql`member_entity_limits`,
          owner: sql`member_id`,
          id: sql`m.id`,
          always: sql`r.key = 'owner'`,
        }),
    })}`
}

/** Open invitations: still pending, expired ones included until resent or withdrawn. */
function openInvitationsSql(organizationId: string, f: Filters): SQL {
  return sql`
    select 'invitation'::text as kind, 1 as rank, 1 as owner_rank, i.id, null::uuid as user_id,
      null::text as name,
      i.email, r.id as role_id, r.key as role_key, r.name as role_name, r.requires_two_step,
      null::boolean as two_factor_enabled, null::boolean as password_reset_required,
      null::boolean as two_step_setup_required, null::int as passkey_count,
      null::timestamptz as joined_at, null::timestamptz as last_active_at,
      i.last_sent_at, i.expires_at, inviter.name as invited_by_name, i.delivery,
      i.delivery_changed_at, null::timestamptz as removed_at, null::text as removed_by_name,
      null::text as sort_name
    from invitations i
    join roles r on r.id = i.role_id and r.organization_id = i.organization_id
    join users inviter on inviter.id = i.invited_by_user_id
    where i.organization_id = ${organizationId} and i.status = 'pending'${filterSql(f, {
      role: sql`i.role_id`,
      id: sql`i.id`,
      search: [sql`i.email`],
      entity: (e) =>
        coversEntity(organizationId, e, {
          table: sql`invitation_entity_limits`,
          owner: sql`invitation_id`,
          id: sql`i.id`,
        }),
    })}`
}

/** One row per removed person (their latest removal), unless they're a member again. */
function removedSql(organizationId: string, f: Filters): SQL {
  return sql`
    select * from (
      select distinct on (m.user_id) 'removed'::text as kind, 2 as rank, 1 as owner_rank, m.id,
        m.user_id,
        u.name, u.email, r.id as role_id, r.key as role_key, r.name as role_name,
        null::boolean as requires_two_step, null::boolean as two_factor_enabled,
        null::boolean as password_reset_required, null::boolean as two_step_setup_required,
        null::int as passkey_count,
        m.joined_at, null::timestamptz as last_active_at,
        null::timestamptz as last_sent_at, null::timestamptz as expires_at,
        null::text as invited_by_name, null::invitation_delivery as delivery,
        null::timestamptz as delivery_changed_at, m.removed_at, remover.name as removed_by_name,
        lower(u.name) as sort_name
      from members m
      join users u on u.id = m.user_id
      join roles r on r.id = m.role_id and r.organization_id = m.organization_id
      left join users remover on remover.id = m.removed_by_user_id
      where m.organization_id = ${organizationId} and m.status = 'removed'
        and not exists (
          select 1 from members again
          where again.organization_id = m.organization_id and again.user_id = m.user_id
            and again.status = 'active')
      order by m.user_id, m.removed_at desc, m.id desc
    ) latest
    where true${filterSql(f, {
      role: sql`latest.role_id`,
      id: sql`latest.id`,
      search: [sql`latest.name`, sql`latest.email`],
      entity: (e) =>
        coversEntity(organizationId, e, {
          table: sql`member_entity_limits`,
          owner: sql`member_id`,
          id: sql`latest.id`,
          always: sql`latest.role_key = 'owner'`,
        }),
    })}`
}

/**
 * The entity filter, intersected with the viewer's own limits (decision 0014): an entity outside
 * them reads like one that doesn't exist, an empty list.
 */
function entityFilter(
  entityId: string | undefined,
  viewerLimit: readonly string[] | null,
): Pick<Filters, 'entityId' | 'none'> {
  if (!entityId) return {}
  return { entityId, none: viewerLimit !== null && !viewerLimit.includes(entityId) }
}

function setSql(
  input: z.output<typeof listTeamInput>,
  organizationId: string,
  scope: Filters,
): SQL {
  const f: Filters = { ...scope, q: input.q || undefined, roleId: input.roleId }
  if (input.show === 'invited') return openInvitationsSql(organizationId, f)
  if (input.show === 'removed') return removedSql(organizationId, f)
  return sql`${activeMembersSql(organizationId, f)} union all ${openInvitationsSql(organizationId, f)}`
}

/**
 * Members first (owners, then everyone A–Z), then open invitations newest sent first (owner's
 * decision, 26 Nov 2026); removed people latest first. `id` breaks ties.
 */
function orderSql(show: z.output<typeof listTeamInput>['show']): SQL {
  return show === 'removed'
    ? sql`order by removed_at desc, id desc`
    : sql`order by rank, owner_rank, sort_name, last_sent_at desc nulls last, id`
}

type Counts = ListTeamOutput['counts'] & { total: number }

/** Chip counts follow the location filter only (not search or role); total follows everything. */
async function countsFor(
  db: DbOrTx,
  organizationId: string,
  scope: Filters,
  filtered: SQL,
): Promise<Counts> {
  const result = await db.execute<Counts>(sql`
    select
      (select count(*) from (${activeMembersSql(organizationId, scope)}) m)::int as members,
      (select count(*) from (${openInvitationsSql(organizationId, scope)}) i)::int as invited,
      (select count(*) from (${removedSql(organizationId, scope)}) r)::int as removed,
      (select count(*) from (${filtered}) f)::int as total
  `)
  const row = result.rows[0]
  return {
    members: row?.members ?? 0,
    invited: row?.invited ?? 0,
    removed: row?.removed ?? 0,
    total: row?.total ?? 0,
  }
}

type LimitRow = { kind: 'member' | 'invitation'; owner_id: string; id: string; name: string }

/** Entity limits for the page's members and invitations, in one query, by name. */
async function limitsFor(
  db: DbOrTx,
  organizationId: string,
  rows: readonly RawRow[],
): Promise<Map<string, EntityRef[]>> {
  const memberIds = rows.filter((r) => r.kind === 'member').map((r) => r.id)
  const invitationIds = rows.filter((r) => r.kind === 'invitation').map((r) => r.id)
  const map = new Map<string, EntityRef[]>()
  if (!memberIds.length && !invitationIds.length) return map
  const parts: SQL[] = []
  if (memberIds.length) {
    parts.push(sql`
      select 'member'::text as kind, l.member_id as owner_id, e.id, e.name
      from member_entity_limits l join entities e on e.id = l.entity_id
      where l.organization_id = ${organizationId} and l.member_id in (${idList(memberIds)})`)
  }
  if (invitationIds.length) {
    parts.push(sql`
      select 'invitation'::text as kind, l.invitation_id as owner_id, e.id, e.name
      from invitation_entity_limits l join entities e on e.id = l.entity_id
      where l.organization_id = ${organizationId} and l.invitation_id in (${idList(invitationIds)})`)
  }
  const result = await db.execute<LimitRow>(
    sql`${sql.join(parts, sql` union all `)} order by name, id`,
  )
  for (const r of result.rows) {
    map.set(r.owner_id, [...(map.get(r.owner_id) ?? []), { id: r.id, name: r.name }])
  }
  return map
}

/** What the viewer may know of someone's access: names inside the viewer's own limit only. */
export function accessFor(viewerLimit: readonly string[] | null, limits: EntityRef[] | undefined) {
  if (!limits?.length) return { kind: 'all' } as const satisfies EntityAccess
  const visible = viewerLimit ? limits.filter((e) => viewerLimit.includes(e.id)) : limits
  return {
    kind: 'some',
    entities: visible,
    hiddenCount: limits.length - visible.length,
  } as const satisfies EntityAccess
}

export function twoStepOf(r: {
  twoFactorEnabled: boolean
  passwordResetRequired: boolean
  twoStepSetupRequired: boolean
  requiresTwoStep: boolean
}): TwoStepState {
  if (r.twoFactorEnabled) return 'on'
  if (r.passwordResetRequired) return 'reset_pending'
  if (r.requiresTwoStep || r.twoStepSetupRequired) return 'setup_required'
  return 'off'
}

/** A queued email that never went out (the process died after commit) reads as failed. */
export function effectiveDelivery(
  delivery: InvitationDelivery,
  lastSentAt: Date,
  now: Date,
): InvitationDelivery {
  return delivery === 'queued' && now.getTime() - lastSentAt.getTime() > INVITATION_QUEUED_STALE_MS
    ? 'failed'
    : delivery
}

const iso = (d: Date | string | null) => rawTimestamp(d)?.toISOString() ?? null
const at = (d: Date | string | null) => rawTimestamp(d) ?? new Date(0)
const roleOf = (r: RawRow) => ({
  id: r.role_id,
  key: r.role_key as SystemRoleKey | null,
  name: r.role_name,
})
const idsOf = (limits: EntityRef[] | undefined) => (limits?.length ? limits.map((e) => e.id) : null)

function memberRow(
  viewer: ManageViewer,
  r: RawRow,
  limits: EntityRef[] | undefined,
  permissions: PermissionSet,
  ownerName: string | null,
  pending: PendingApproval | null,
): TeamMemberRow {
  const twoStep = twoStepOf({
    twoFactorEnabled: Boolean(r.two_factor_enabled),
    passwordResetRequired: Boolean(r.password_reset_required),
    twoStepSetupRequired: Boolean(r.two_step_setup_required),
    requiresTwoStep: Boolean(r.requires_two_step),
  })
  const userId = r.user_id ?? ''
  const name = r.name ?? r.email
  const passkeyCount = r.passkey_count ?? 0
  const rights = memberRowRights(
    viewer,
    {
      userId,
      name,
      roleKey: r.role_key,
      permissions,
      entityIds: idsOf(limits),
      twoStep,
      passkeyCount,
    },
    ownerName,
  )
  return {
    kind: 'member',
    id: r.id,
    userId,
    name,
    email: r.email,
    isYou: userId === viewer.userId,
    role: roleOf(r),
    access: accessFor(viewer.entityIds, limits),
    twoStep,
    passkeyCount,
    joinedAt: at(r.joined_at).toISOString(),
    lastActiveAt: iso(r.last_active_at),
    ...rights,
    pendingApproval: pending,
  }
}

function invitationRow(
  viewer: ManageViewer,
  r: RawRow,
  limits: EntityRef[] | undefined,
  permissions: PermissionSet,
  ownerName: string | null,
  now: Date,
): TeamInvitationRow {
  const lastSentAt = rawTimestamp(r.last_sent_at) ?? now
  const expiresAt = rawTimestamp(r.expires_at) ?? now
  return {
    kind: 'invitation',
    id: r.id,
    email: r.email,
    role: roleOf(r),
    access: accessFor(viewer.entityIds, limits),
    status: expiresAt <= now ? 'expired' : 'pending',
    invitedByName: r.invited_by_name ?? '',
    lastSentAt: lastSentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    delivery: effectiveDelivery(r.delivery ?? 'queued', lastSentAt, now),
    deliveryChangedAt: iso(r.delivery_changed_at),
    ...invitationRowRights(
      viewer,
      { email: r.email, roleKey: r.role_key, permissions, entityIds: idsOf(limits) },
      ownerName,
    ),
  }
}

function removedRow(r: RawRow): TeamRemovedRow {
  return {
    kind: 'removed',
    id: r.id,
    userId: r.user_id ?? '',
    name: r.name ?? r.email,
    email: r.email,
    role: roleOf(r),
    removedAt: at(r.removed_at).toISOString(),
    removedByName: r.removed_by_name,
  }
}

/**
 * Turns raw rows into list rows: one limits query, one query for the page's roles' permissions
 * (the ceiling), plus the owner's name only when needed.
 */
async function hydrate(ctx: ServiceContext, rows: readonly RawRow[]): Promise<TeamRow[]> {
  const viewer = viewerOf(ctx)
  const limits = await limitsFor(ctx.db, ctx.organizationId, rows)
  const live = rows.filter((r) => r.kind !== 'removed')
  const roleIds = [...new Set(live.map((r) => r.role_id))]
  const roles = await loadRoles(ctx.db, ctx.organizationId, roleIds, { includeArchived: true })
  const permissionsOf = new Map(roles.map((role) => [role.id, role.permissions]))
  const permissions = (r: RawRow) => permissionsOf.get(r.role_id) ?? emptyPermissionSet()
  // "Ask Olumide Bankole (owner)" only appears for rows wider than the viewer.
  const needsOwner = live.some((r) =>
    needsOwnerName(viewer, { entityIds: idsOf(limits.get(r.id)), permissions: permissions(r) }),
  )
  const ownerName = needsOwner
    ? ((await firstOwner(ctx.db, ctx.organizationId, ctx.user.id))?.name ?? null)
    : null
  // "Owner · waiting for approval": the page's make-owner requests, in one query.
  const memberIds = rows.filter((r) => r.kind === 'member').map((r) => r.id)
  const pending = await pendingApprovals(
    ctx.db,
    ctx,
    'access.member.make_owner',
    'member',
    memberIds,
  )
  const now = new Date()
  return rows.map((r) => {
    if (r.kind === 'member') {
      const waiting = pending.get(r.id) ?? null
      return memberRow(viewer, r, limits.get(r.id), permissions(r), ownerName, waiting)
    }
    if (r.kind === 'invitation') {
      return invitationRow(viewer, r, limits.get(r.id), permissions(r), ownerName, now)
    }
    return removedRow(r)
  })
}

export async function listTeam(
  ctx: ServiceContext,
  input: z.output<typeof listTeamInput>,
): Promise<ListTeamOutput> {
  const { limit, offset } = pageOffset(input)
  const scope = entityFilter(input.entityId, ctx.member.entityIds)
  const filtered = setSql(input, ctx.organizationId, scope)
  const [page, counts] = await runQueries(ctx.db, [
    () =>
      ctx.db.execute<RawRow>(sql`
        select * from (${filtered}) t ${orderSql(input.show)} limit ${limit} offset ${offset}`),
    () => countsFor(ctx.db, ctx.organizationId, scope, filtered),
  ])
  const items = await hydrate(ctx, page.rows)
  const { total, ...organizationCounts } = counts
  return { ...toPage(items, input, total), counts: organizationCounts }
}

/** One active member's row as the viewer sees it (after a change, to replace it in place). */
export async function memberRowById(
  ctx: ServiceContext,
  memberId: string,
): Promise<TeamMemberRow | null> {
  const result = await ctx.db.execute<RawRow>(
    activeMembersSql(ctx.organizationId, { ids: [memberId] }),
  )
  const [row] = await hydrate(ctx, result.rows)
  return row?.kind === 'member' ? row : null
}

/** Open invitations' rows as the viewer sees them, newest sent first. */
export async function invitationRowsById(
  ctx: ServiceContext,
  ids: readonly string[],
): Promise<TeamInvitationRow[]> {
  if (!ids.length) return []
  const result = await ctx.db.execute<RawRow>(
    sql`${openInvitationsSql(ctx.organizationId, { ids })} order by i.last_sent_at desc, i.email`,
  )
  const rows = await hydrate(ctx, result.rows)
  return rows.filter((r): r is TeamInvitationRow => r.kind === 'invitation')
}
