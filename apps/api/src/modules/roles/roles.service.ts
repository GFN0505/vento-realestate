import {
  approvableModules,
  customRolePluralName,
  hasPermission,
  MAX_CUSTOM_ROLES,
  normalisePermissions,
  PERMISSION_MODULES,
  type PermissionSet,
  permissionChanges,
  type Role,
  roleNeedsTwoStep,
  SYSTEM_ROLE_KEYS,
  type SystemRoleKey,
  type updateRoleInput,
} from '@vento/shared'
import { and, count, desc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, lockViewer, type ServiceContext, toPermissionSet } from '@/access/context'
import {
  GRANT_CEILING_MESSAGE,
  type ManageViewer,
  viewerOf,
  widerThan,
} from '@/access/manage-rules'
import {
  type RoleAction,
  type RoleAsk,
  type RoleSubject,
  roleNeedsOwnerName,
  roleRefusal,
  roleRights,
} from '@/access/role-refusals'
import { firstOwner, whoCanGrant } from '@/access/who-can-grant'
import type { DbOrTx } from '@/db/client'
import { auditEvents, rolePermissions, roles } from '@/db/schema'
import {
  badRequest,
  conflict,
  forbidden,
  isGuardViolation,
  isUniqueViolation,
  notFound,
} from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import { lockOrganization } from '@/modules/organization/organization.service'

/** A role and what it can do, without the viewer-specific flags. */
export type RoleRecord = Omit<Role, 'memberCount' | 'invitedCount' | 'can' | 'readOnly'>

const SYSTEM_ORDER = sql.raw(`array[${SYSTEM_ROLE_KEYS.map((k) => `'${k}'`).join(',')}]::text[]`)

/**
 * Live roles with their permissions, in two queries: built-ins in the default order, then
 * custom roles A–Z. Archived (deleted) roles only with `includeArchived`.
 */
export async function loadRoles(
  db: DbOrTx,
  organizationId: string,
  roleIds?: readonly string[],
  options: { includeArchived?: boolean; lock?: 'share' | 'update' } = {},
): Promise<RoleRecord[]> {
  if (roleIds?.length === 0) return []
  const query = db
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        roleIds ? inArray(roles.id, [...roleIds]) : undefined,
        options.includeArchived ? undefined : isNull(roles.archivedAt),
      ),
    )
    .orderBy(
      sql`array_position(${SYSTEM_ORDER}, ${roles.key}) nulls last`,
      sql`lower(${roles.name})`,
      roles.id,
    )
  const rows = options.lock ? await query.for(options.lock) : await query
  if (rows.length === 0) return []
  const perms = await db
    .select({
      roleId: rolePermissions.roleId,
      module: rolePermissions.module,
      action: rolePermissions.action,
    })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.organizationId, organizationId),
        inArray(
          rolePermissions.roleId,
          rows.map((r) => r.id),
        ),
      ),
    )
  return rows.map((r) => {
    const permissions = normalisePermissions(
      toPermissionSet(perms.filter((p) => p.roleId === r.id).map((p) => `${p.module}.${p.action}`)),
    )
    return {
      id: r.id,
      key: r.key as SystemRoleKey | null,
      name: r.name,
      pluralName: r.pluralName,
      description: r.description,
      isSystem: r.isSystem,
      requiresTwoStep: r.requiresTwoStep,
      permissions,
      canApprove: approvableModules(permissions),
      version: r.version,
    }
  })
}

type Holders = { members: number; invited: number }

/**
 * Who holds each role, in one grouped query: active members, and open invitations (expired
 * ones included, because they're still on Team and can be resent).
 */
export async function holderCounts(
  db: DbOrTx,
  organizationId: string,
  roleIds?: readonly string[],
): Promise<Map<string, Holders>> {
  const only = (column: SQL) =>
    roleIds
      ? sql` and ${column} in (${sql.join(
          roleIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``
  const result = await db.execute<{ role_id: string; members: number; invited: number }>(sql`
    select role_id,
      count(*) filter (where kind = 'member')::int as members,
      count(*) filter (where kind = 'invitation')::int as invited
    from (
      select m.role_id, 'member' as kind from members m
        where m.organization_id = ${organizationId} and m.status = 'active'${only(sql`m.role_id`)}
      union all
      select i.role_id, 'invitation' as kind from invitations i
        where i.organization_id = ${organizationId} and i.status = 'pending'${only(sql`i.role_id`)}
    ) h
    group by role_id
  `)
  return new Map(result.rows.map((r) => [r.role_id, { members: r.members, invited: r.invited }]))
}

/** The names the refusal lines need, looked up only when some line will use them. */
async function askFor(
  db: DbOrTx,
  ctx: ServiceContext,
  viewer: ManageViewer,
  subjects: readonly RoleSubject[],
): Promise<RoleAsk> {
  const needsOwner = subjects.some((r) => roleNeedsOwnerName(viewer, r))
  const ownerName = needsOwner
    ? ((await firstOwner(db, ctx.organizationId, ctx.user.id))?.name ?? null)
    : null
  // Only the edit line is shown, so only a viewer without Settings: Edit needs it.
  const permissionMessage = hasPermission(viewer.permissions, 'settings', 'edit')
    ? ''
    : (
        await whoCanGrant(db, {
          organizationId: ctx.organizationId,
          module: 'settings',
          action: 'edit',
          doing: 'change roles',
          excludeUserId: ctx.user.id,
        })
      ).message
  return { ownerName, permissionMessage }
}

/** Roles as this viewer sees them: holder counts and what they may do with each. */
async function viewRoles(
  db: DbOrTx,
  ctx: ServiceContext,
  roleIds?: readonly string[],
): Promise<Role[]> {
  const records = await loadRoles(db, ctx.organizationId, roleIds)
  if (records.length === 0) return []
  const holders = await holderCounts(db, ctx.organizationId, roleIds)
  const viewer = viewerOf(ctx)
  const ask = await askFor(db, ctx, viewer, records)
  return records.map((r) => {
    const h = holders.get(r.id) ?? { members: 0, invited: 0 }
    const counted = { ...r, memberCount: h.members, invitedCount: h.invited }
    return { ...counted, ...roleRights(viewer, counted, ask) }
  })
}

/** One page: the list is bounded (9 built-ins plus at most 50 custom roles). */
export async function listRoles(ctx: ServiceContext) {
  const items = await viewRoles(ctx.db, ctx, undefined)
  return { items, page: 1, pageSize: Math.max(items.length, 1), total: items.length }
}

export async function getRole(ctx: ServiceContext, id: string, db: DbOrTx = ctx.db) {
  const [role] = await viewRoles(db, ctx, [id])
  if (!role) throw notFound()
  return role
}

async function refuse(
  tx: DbOrTx,
  ctx: ServiceContext,
  role: RoleSubject,
  action: RoleAction,
): Promise<void> {
  const viewer = viewerOf(ctx)
  const refusal = roleRefusal(viewer, role, action, await askFor(tx, ctx, viewer, [role]))
  if (refusal) throw forbidden(refusal.reason, refusal.message)
}

const nameTaken = (name: string) =>
  conflict('role_name_taken', `A role called ${name} already exists.`)

/** Any live role with this name, any case, built-ins included. */
async function assertNameFree(tx: DbOrTx, ctx: ServiceContext, name: string, exceptId?: string) {
  const [taken] = await tx
    .select({ name: roles.name })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, ctx.organizationId),
        isNull(roles.archivedAt),
        sql`lower(${roles.name}) = lower(${name})`,
        exceptId ? ne(roles.id, exceptId) : undefined,
      ),
    )
  if (taken) throw nameTaken(name)
}

/** Two saves racing past the check: the partial unique index decides. */
async function onNameRace<T>(name: string, write: Promise<T>): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isUniqueViolation(error, 'roles_org_name_unique')) throw nameTaken(name)
    throw error
  }
}

async function insertPermissions(
  tx: DbOrTx,
  organizationId: string,
  roleId: string,
  set: PermissionSet,
) {
  const rows = PERMISSION_MODULES.flatMap((module) =>
    set[module].map((action) => ({ organizationId, roleId, module, action })),
  )
  if (rows.length) await tx.insert(rolePermissions).values(rows)
}

/** Only modules with access, for a readable audit trail. */
const granted = (set: PermissionSet) =>
  Object.fromEntries(PERMISSION_MODULES.filter((m) => set[m].length).map((m) => [m, set[m]]))

async function liveCustomRoles(tx: DbOrTx, organizationId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(roles)
    .where(
      and(eq(roles.organizationId, organizationId), isNull(roles.key), isNull(roles.archivedAt)),
    )
  return row?.n ?? 0
}

/** A custom role copying the source's permissions and two-step value. */
export async function createRole(
  ctx: ServiceContext,
  input: { name: string; sourceRoleId: string },
): Promise<{ notice: string; role: Role }> {
  return ctx.db.transaction(async (tx) => {
    // Serialises creates, so two can't both pass the 50-role guard.
    await lockOrganization(tx, ctx.organizationId)
    // The creator as they are now (their own role can't change until this commits).
    const live = await lockViewer(tx, ctx)
    const [source] = await loadRoles(tx, live.organizationId, [input.sourceRoleId])
    if (!source) throw notFound()
    await refuse(tx, live, source, 'duplicate')
    if ((await liveCustomRoles(tx, live.organizationId)) >= MAX_CUSTOM_ROLES) {
      throw conflict(
        'role_limit',
        `You can have up to ${MAX_CUSTOM_ROLES} custom roles. Delete one you no longer use.`,
      )
    }
    await assertNameFree(tx, live, input.name)
    const requiresTwoStep = source.requiresTwoStep || roleNeedsTwoStep(source.permissions)
    const [row] = await onNameRace(
      input.name,
      tx
        .insert(roles)
        .values({
          organizationId: live.organizationId,
          key: null,
          isSystem: false,
          name: input.name,
          pluralName: customRolePluralName(input.name),
          description: `Based on ${source.name}`,
          requiresTwoStep,
        })
        .returning({ id: roles.id }),
    )
    if (!row) throw new Error('Role insert returned nothing')
    await insertPermissions(tx, live.organizationId, row.id, source.permissions)
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'role.created',
      actor: actorOf(live),
      target: { type: 'role', id: row.id, label: input.name },
      after: {
        name: input.name,
        source: source.name,
        requiresTwoStep,
        permissions: granted(source.permissions),
      },
    })
    return { notice: `${input.name} created`, role: await getRole(live, row.id, tx) }
  })
}

/** Who saved the role last, for "Aisha Bello changed Site engineer a moment ago". */
async function lastChangedBy(tx: DbOrTx, ctx: ServiceContext, roleId: string): Promise<string> {
  const [row] = await tx
    .select({ name: auditEvents.actorName })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.targetType, 'role'),
        eq(auditEvents.targetId, roleId),
        eq(auditEvents.action, 'role.updated'),
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(1)
  return row?.name ?? 'Someone'
}

const TWO_STEP_REQUIRED =
  "This role needs two-step sign-in because it can manage money, payroll or people's access."

/**
 * Saves a custom role: only changed fields, permissions replaced, version bumped. The version
 * sent must be the one in the database, so two people editing at once can't overwrite each
 * other. Undo is this call again with the old values and the new version.
 */
export async function updateRole(
  ctx: ServiceContext,
  input: z.output<typeof updateRoleInput>,
): Promise<{ notice: string; role: Role }> {
  return ctx.db.transaction(async (tx) => {
    // Serialises role saves, so two editors locking each other's roles can't deadlock.
    await lockOrganization(tx, ctx.organizationId)
    const live = await lockViewer(tx, ctx)
    const [current] = await loadRoles(tx, live.organizationId, [input.id], { lock: 'update' })
    if (!current) throw notFound()
    await refuse(tx, live, current, 'edit')
    const next = {
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      requiresTwoStep: input.requiresTwoStep ?? current.requiresTwoStep,
      permissions: normalisePermissions(input.permissions ?? current.permissions),
    }
    if (widerThan(viewerOf(live), next.permissions)) {
      throw forbidden('wider_permissions', GRANT_CEILING_MESSAGE)
    }
    if (roleNeedsTwoStep(next.permissions) && !next.requiresTwoStep) {
      throw badRequest('role_needs_two_step', TWO_STEP_REQUIRED)
    }
    if (current.version !== input.version) {
      const by = await lastChangedBy(tx, live, current.id)
      throw conflict(
        'role_changed',
        `${by} changed ${current.name} a moment ago. Reload to see the latest, then make your change again.`,
        { changedByName: by },
      )
    }
    const changes = permissionChanges(current.permissions, next.permissions)
    const fields = (['name', 'description', 'requiresTwoStep'] as const).filter(
      (k) => next[k] !== current[k],
    )
    if (changes.length === 0 && fields.length === 0) {
      return { notice: `${current.name} saved`, role: await getRole(live, current.id, tx) }
    }
    if (next.name !== current.name) await assertNameFree(tx, live, next.name, current.id)
    await onNameRace(
      next.name,
      tx
        .update(roles)
        .set({
          name: next.name,
          pluralName: customRolePluralName(next.name),
          description: next.description,
          requiresTwoStep: next.requiresTwoStep,
          version: sql`${roles.version} + 1`,
        })
        .where(and(eq(roles.organizationId, live.organizationId), eq(roles.id, current.id))),
    )
    if (changes.length) {
      await tx
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.organizationId, live.organizationId),
            eq(rolePermissions.roleId, current.id),
          ),
        )
      await insertPermissions(tx, live.organizationId, current.id, next.permissions)
    }
    const touched = changes.map((c) => c.module)
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'role.updated',
      actor: actorOf(live),
      target: { type: 'role', id: current.id, label: next.name },
      before: {
        ...Object.fromEntries(fields.map((k) => [k, current[k]])),
        ...(touched.length && {
          permissions: Object.fromEntries(touched.map((m) => [m, current.permissions[m]])),
        }),
      },
      after: {
        ...Object.fromEntries(fields.map((k) => [k, next[k]])),
        ...(touched.length && {
          permissions: Object.fromEntries(touched.map((m) => [m, next.permissions[m]])),
        }),
      },
      metadata: { version: current.version + 1, changes },
    })
    return { notice: `${next.name} saved`, role: await getRole(live, current.id, tx) }
  })
}

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`)

/** Removed members or answered invitations still refer to the role (non-negotiable 7). */
async function hasHistory(tx: DbOrTx, organizationId: string, roleId: string): Promise<boolean> {
  const result = await tx.execute<{ yes: boolean }>(sql`
    select (
      exists (select 1 from members where organization_id = ${organizationId}
        and role_id = ${roleId} and status <> 'active')
      or exists (select 1 from invitations where organization_id = ${organizationId}
        and role_id = ${roleId} and status <> 'pending')
    ) as yes
  `)
  return Boolean(result.rows[0]?.yes)
}

function inUse(name: string, holders: Holders) {
  return conflict(
    'role_in_use',
    `Move ${people(holders.members + holders.invited)} to another role first. ${name} can only be deleted when nobody has it.`,
    { holders },
  )
}

/**
 * Deletes a custom role nobody holds: erased, or archived (hidden, its name free again) when
 * history refers to it. The role row is locked, so an assignment can't slip in between.
 */
export async function deleteRole(ctx: ServiceContext, id: string): Promise<{ notice: string }> {
  return ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const live = await lockViewer(tx, ctx)
    const [role] = await loadRoles(tx, live.organizationId, [id], { lock: 'update' })
    if (!role) throw notFound()
    await refuse(tx, live, role, 'delete')
    const holders = (await holderCounts(tx, live.organizationId, [id])).get(id)
    if (holders && holders.members + holders.invited > 0) throw inUse(role.name, holders)
    const kept = (await hasHistory(tx, live.organizationId, id)) ? 'archived' : 'erased'
    try {
      const where = and(eq(roles.organizationId, live.organizationId), eq(roles.id, id))
      if (kept === 'archived') await tx.update(roles).set({ archivedAt: new Date() }).where(where)
      else await tx.delete(roles).where(where)
    } catch (error) {
      if (isGuardViolation(error, 'roles_archive_unheld')) {
        throw inUse(role.name, { members: 0, invited: 0 })
      }
      throw error
    }
    await recordAudit(tx, {
      organizationId: live.organizationId,
      action: 'role.deleted',
      actor: actorOf(live),
      target: { type: 'role', id, label: role.name },
      before: { name: role.name, permissions: granted(role.permissions) },
      metadata: { kept },
    })
    return { notice: `${role.name} deleted` }
  })
}

/**
 * Locks the roles being given (`for share`, so a delete waits) and returns them. A role that is
 * missing, deleted (erased or archived) meanwhile, or another organization's is
 * `role_unavailable`: one generic answer that tells the caller nothing about other
 * organizations, and that a racing delete can't turn into NOT_FOUND. Lock order: see
 * docs/ARCHITECTURE.md ("Lock order").
 */
export async function lockAssignableRoles(
  tx: DbOrTx,
  organizationId: string,
  roleIds: readonly string[],
): Promise<RoleRecord[]> {
  const unique = [...new Set(roleIds)]
  const rows = await tx
    .select({ id: roles.id, archivedAt: roles.archivedAt })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), inArray(roles.id, unique)))
    .for('share')
  if (rows.length !== unique.length || rows.some((r) => r.archivedAt !== null)) {
    throw roleUnavailable()
  }
  return loadRoles(tx, organizationId, unique)
}

export function roleUnavailable() {
  return conflict('role_unavailable', 'That role no longer exists. Choose another.')
}

/** Maps a guard-trigger hit on assigning a role to the same copy as the service's own check. */
export async function onArchivedRole<T>(write: Promise<T>): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (
      isGuardViolation(error, 'members_role_not_archived') ||
      isGuardViolation(error, 'invitations_role_not_archived')
    ) {
      throw roleUnavailable()
    }
    throw error
  }
}
