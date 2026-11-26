import {
  type Entity,
  type EntityArchivePreview,
  type entityInput,
  type ListEntitiesOutput,
  type listEntitiesInput,
  normaliseRcNumber,
  normaliseTin,
  type updateEntityInput,
} from '@vento/shared'
import { and, asc, count, eq, ilike, ne, or, type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { entityScope } from '@/access/entity-scope'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { entities, users } from '@/db/schema'
import { conflict, isUniqueViolation, notFound } from '@/lib/errors'
import { likePattern } from '@/lib/like'
import { pageOffset, toPage } from '@/lib/paginate'
import { recordAudit } from '@/modules/audit/audit.service'
import { diff, lockOrganization } from '@/modules/organization/organization.service'
import { assertWithinLimit } from '@/platform/limits'

type EntityRow = typeof entities.$inferSelect

export function toEntity(row: EntityRow, archivedByName: string | null = null): Entity {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    rcNumber: row.rcNumber,
    tin: row.tin,
    vatRegistered: row.vatRegistered,
    baseCurrency: 'NGN',
    status: row.status,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archivedByName: row.status === 'archived' ? archivedByName : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Org filter plus the member's entity limit: anything else is "not found". */
function visible(ctx: ServiceContext) {
  return and(eq(entities.organizationId, ctx.organizationId), entityScope(ctx.member, entities.id))
}

/** Entities with who archived them ("Archived 2 Dec 2026 by Olumide Bankole"). */
function selectWithArchiver(db: DbOrTx, where: SQL | undefined) {
  return db
    .select({ entity: entities, archivedByName: users.name })
    .from(entities)
    .leftJoin(users, eq(users.id, entities.archivedByUserId))
    .where(where)
}

export async function listEntities(
  ctx: ServiceContext,
  input: z.output<typeof listEntitiesInput>,
): Promise<ListEntitiesOutput> {
  const pattern = input.q ? likePattern(input.q) : null
  const where = and(
    visible(ctx),
    input.status ? eq(entities.status, input.status) : undefined,
    pattern ? or(ilike(entities.name, pattern), ilike(entities.rcNumber, pattern)) : undefined,
  )
  const { limit, offset } = pageOffset(input)
  const [rows, [tally]] = await runQueries(ctx.db, [
    () =>
      selectWithArchiver(ctx.db, where)
        .orderBy(asc(entities.name), asc(entities.id))
        .limit(limit)
        .offset(offset),
    // The chips count everything within the viewer's access; the total follows the filters.
    () =>
      ctx.db
        .select({
          active: sql<number>`count(*) filter (where ${entities.status} = 'active')::int`,
          archived: sql<number>`count(*) filter (where ${entities.status} = 'archived')::int`,
          total: sql<number>`count(*) filter (where ${where ?? sql`true`})::int`,
        })
        .from(entities)
        .where(visible(ctx)),
  ])
  const items = rows.map((r) => toEntity(r.entity, r.archivedByName))
  return {
    ...toPage(items, input, tally?.total ?? 0),
    counts: { active: tally?.active ?? 0, archived: tally?.archived ?? 0 },
  }
}

async function findVisible(
  ctx: ServiceContext,
  db: DbOrTx,
  id: string,
  lock = false,
): Promise<EntityRow> {
  const query = db
    .select()
    .from(entities)
    .where(and(visible(ctx), eq(entities.id, id)))
  const [row] = lock ? await query.for('update') : await query
  if (!row) throw notFound()
  return row
}

export async function getEntity(ctx: ServiceContext, id: string): Promise<Entity> {
  const [row] = await selectWithArchiver(ctx.db, and(visible(ctx), eq(entities.id, id)))
  if (!row) throw notFound()
  return toEntity(row.entity, row.archivedByName)
}

/**
 * Refuses an RC number another company in the organization uses, archived ones included. The
 * company is named only when it lies within the viewer's access (with its id, for "Restore it
 * instead"); otherwise the message stays general.
 */
async function assertRcFree(tx: DbOrTx, ctx: ServiceContext, rc: string | null, exceptId?: string) {
  if (!rc) return
  const [taken] = await tx
    .select({ id: entities.id, name: entities.name, status: entities.status })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, ctx.organizationId),
        eq(entities.rcNumber, rc),
        exceptId ? ne(entities.id, exceptId) : undefined,
      ),
    )
  if (!taken) return
  const limit = ctx.member.entityIds
  if (limit !== null && !limit.includes(taken.id)) {
    throw conflict('rc_number_taken', `Another company already uses ${rc}.`)
  }
  const archived = taken.status === 'archived'
  throw conflict(
    'rc_number_taken',
    `${taken.name}${archived ? ' (archived)' : ''} already uses ${rc}.`,
    { entity: { id: taken.id, name: taken.name, archived } },
  )
}

/** Insert + audit; the caller owns the transaction. Checks the plan's entity limit. */
export async function insertEntity(
  tx: DbOrTx,
  ctx: ServiceContext,
  input: z.output<typeof entityInput>,
): Promise<Entity> {
  const rcNumber = input.rcNumber ? normaliseRcNumber(input.rcNumber) : null
  const tin = input.tin ? normaliseTin(input.tin) : null
  await assertWithinLimit(tx, ctx, 'entities', 1)
  await assertRcFree(tx, ctx, rcNumber)
  try {
    const [row] = await tx
      .insert(entities)
      .values({ ...input, rcNumber, tin, organizationId: ctx.organizationId })
      .returning()
    if (!row) throw new Error('Entity insert returned nothing')
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'entity.created',
      actor: actorOf(ctx),
      target: { type: 'entity', id: row.id, label: row.name },
      after: { name: row.name, type: row.type, rcNumber, tin, vatRegistered: row.vatRegistered },
    })
    return toEntity(row)
  } catch (error) {
    // Two requests racing past the check: the unique index decides.
    if (isUniqueViolation(error, 'entities_org_rc_unique')) {
      throw conflict('rc_number_taken', `Another company already uses ${rcNumber}.`)
    }
    throw error
  }
}

export async function createEntity(ctx: ServiceContext, input: z.output<typeof entityInput>) {
  return ctx.db.transaction((tx) => insertEntity(tx, ctx, input))
}

export async function updateEntity(
  ctx: ServiceContext,
  input: z.output<typeof updateEntityInput>,
): Promise<Entity> {
  const { id, ...rest } = input
  return ctx.db.transaction(async (tx) => {
    const current = await findVisible(ctx, tx, id, true)
    if (current.status === 'archived') {
      throw conflict('entity_archived', `${current.name} is archived. Restore it to make changes.`)
    }
    const patch = {
      ...rest,
      ...(rest.rcNumber !== undefined && {
        rcNumber: rest.rcNumber ? normaliseRcNumber(rest.rcNumber) : null,
      }),
      ...(rest.tin !== undefined && { tin: rest.tin ? normaliseTin(rest.tin) : null }),
    }
    const change = diff(current, patch)
    if (change.changed.length === 0) return toEntity(current)
    if (patch.rcNumber !== undefined) await assertRcFree(tx, ctx, patch.rcNumber, id)
    const [row] = await tx
      .update(entities)
      .set(patch)
      .where(and(eq(entities.organizationId, ctx.organizationId), eq(entities.id, id)))
      .returning()
    if (!row) throw notFound()
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'entity.updated',
      actor: actorOf(ctx),
      target: { type: 'entity', id, label: row.name },
      before: change.before,
      after: change.after,
    })
    return toEntity(row)
  })
}

/**
 * Active members whose only active entity is this one: they'd see no company after archiving.
 * Up to three names, A–Z, and the total.
 */
async function membersOnlyThisEntity(
  db: DbOrTx,
  organizationId: string,
  entityId: string,
): Promise<EntityArchivePreview['members']> {
  const result = await db.execute<{ n: number; names: string[] | null }>(sql`
    select count(*)::int as n,
      (array_agg(u.name order by lower(u.name), u.id))[1:3] as names
    from (
      select l.member_id
      from member_entity_limits l
      join members m on m.id = l.member_id and m.organization_id = l.organization_id and m.status = 'active'
      join entities e on e.id = l.entity_id and e.organization_id = l.organization_id and e.status = 'active'
      where l.organization_id = ${organizationId}
      group by l.member_id
      having count(*) = 1 and bool_or(l.entity_id = ${entityId})
    ) t
    join members m on m.id = t.member_id
    join users u on u.id = m.user_id
  `)
  const row = result.rows[0]
  return { count: row?.n ?? 0, names: row?.names ?? [] }
}

async function activeEntityCount(db: DbOrTx, organizationId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(entities)
    .where(and(eq(entities.organizationId, organizationId), eq(entities.status, 'active')))
  return row?.n ?? 0
}

export async function archivePreview(
  ctx: ServiceContext,
  id: string,
): Promise<EntityArchivePreview> {
  const entity = await findVisible(ctx, ctx.db, id)
  return {
    isLastActive:
      entity.status === 'active' && (await activeEntityCount(ctx.db, ctx.organizationId)) === 1,
    members: await membersOnlyThisEntity(ctx.db, ctx.organizationId, id),
  }
}

export async function archiveEntity(ctx: ServiceContext, id: string): Promise<Entity> {
  return ctx.db.transaction(async (tx) => {
    // Serialises archives so two can't both pass the "last active entity" check.
    await lockOrganization(tx, ctx.organizationId)
    const entity = await findVisible(ctx, tx, id, true)
    if (entity.status === 'archived') {
      throw conflict(
        'not_archivable',
        `${entity.name} is already archived. The list is up to date.`,
      )
    }
    if ((await activeEntityCount(tx, ctx.organizationId)) <= 1) {
      throw conflict('last_entity', `${ctx.organizationName} needs at least one active company.`)
    }
    const limitedMembers = await membersOnlyThisEntity(tx, ctx.organizationId, id)
    const [row] = await tx
      .update(entities)
      .set({ status: 'archived', archivedAt: new Date(), archivedByUserId: ctx.user.id })
      .where(and(eq(entities.organizationId, ctx.organizationId), eq(entities.id, id)))
      .returning()
    if (!row) throw notFound()
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'entity.archived',
      actor: actorOf(ctx),
      target: { type: 'entity', id, label: row.name },
      before: { status: 'active' },
      after: { status: 'archived' },
      metadata: { membersOnlyThisEntity: limitedMembers.count },
    })
    return toEntity(row, ctx.user.name)
  })
}

/**
 * Back to active, within the plan's company limit (checked in this transaction, so two
 * restores can't both take the last place). Also the Undo after archiving. Lock order:
 * organization → entity → plan row.
 */
export async function restoreEntity(ctx: ServiceContext, id: string): Promise<Entity> {
  return ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const entity = await findVisible(ctx, tx, id, true)
    if (entity.status === 'active') {
      throw conflict('not_restorable', `${entity.name} is already active. The list is up to date.`)
    }
    await assertWithinLimit(tx, ctx, 'entities', 1)
    const [row] = await tx
      .update(entities)
      .set({ status: 'active', archivedAt: null, archivedByUserId: null })
      .where(and(eq(entities.organizationId, ctx.organizationId), eq(entities.id, id)))
      .returning()
    if (!row) throw notFound()
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'entity.restored',
      actor: actorOf(ctx),
      target: { type: 'entity', id, label: row.name },
      before: { status: 'archived' },
      after: { status: 'active' },
    })
    return toEntity(row)
  })
}
