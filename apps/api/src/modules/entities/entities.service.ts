import {
  type Entity,
  type entityInput,
  type listEntitiesInput,
  normaliseRcNumber,
  normaliseTin,
  type updateEntityInput,
} from '@vento/shared'
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { entityScope } from '@/access/entity-scope'
import type { DbOrTx } from '@/db/client'
import { entities } from '@/db/schema'
import { conflict, isUniqueViolation, notFound } from '@/lib/errors'
import { pageOffset, toPage } from '@/lib/paginate'
import { recordAudit } from '@/modules/audit/audit.service'
import { diff, lockOrganization } from '@/modules/organization/organization.service'

type EntityRow = typeof entities.$inferSelect

export function toEntity(row: EntityRow): Entity {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Org filter plus the member's entity limit: anything else is "not found". */
function visible(ctx: ServiceContext) {
  return and(eq(entities.organizationId, ctx.organizationId), entityScope(ctx.member, entities.id))
}

export async function listEntities(ctx: ServiceContext, input: z.output<typeof listEntitiesInput>) {
  const where = and(visible(ctx), input.status ? eq(entities.status, input.status) : undefined)
  const { limit, offset } = pageOffset(input)
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select()
      .from(entities)
      .where(where)
      .orderBy(asc(entities.name))
      .limit(limit)
      .offset(offset),
    ctx.db.select({ n: count() }).from(entities).where(where),
  ])
  return toPage(rows.map(toEntity), input, total?.n ?? 0)
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
  return toEntity(await findVisible(ctx, ctx.db, id))
}

async function assertRcFree(tx: DbOrTx, ctx: ServiceContext, rc: string | null, exceptId?: string) {
  if (!rc) return
  const [taken] = await tx
    .select({ name: entities.name })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, ctx.organizationId),
        eq(entities.rcNumber, rc),
        exceptId ? ne(entities.id, exceptId) : undefined,
      ),
    )
  if (taken) throw conflict('rc_number_taken', `${taken.name} already uses ${rc}.`)
}

/** Insert + audit; the caller owns the transaction. */
export async function insertEntity(
  tx: DbOrTx,
  ctx: ServiceContext,
  input: z.output<typeof entityInput>,
): Promise<Entity> {
  const rcNumber = input.rcNumber ? normaliseRcNumber(input.rcNumber) : null
  const tin = input.tin ? normaliseTin(input.tin) : null
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
      throw conflict('rc_number_taken', `Another entity already uses ${rcNumber}.`)
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

async function membersOnlyThisEntity(db: DbOrTx, organizationId: string, entityId: string) {
  // Members whose only active entity is this one would see no entity after archiving.
  const result = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select l.member_id
      from member_entity_limits l
      join members m on m.id = l.member_id and m.organization_id = l.organization_id and m.status = 'active'
      join entities e on e.id = l.entity_id and e.organization_id = l.organization_id and e.status = 'active'
      where l.organization_id = ${organizationId}
      group by l.member_id
      having count(*) = 1 and bool_or(l.entity_id = ${entityId})
    ) t
  `)
  return result.rows[0]?.n ?? 0
}

async function activeEntityCount(db: DbOrTx, organizationId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(entities)
    .where(and(eq(entities.organizationId, organizationId), eq(entities.status, 'active')))
  return row?.n ?? 0
}

export async function archivePreview(ctx: ServiceContext, id: string) {
  const entity = await findVisible(ctx, ctx.db, id)
  return {
    membersOnlyThisEntity: await membersOnlyThisEntity(ctx.db, ctx.organizationId, id),
    isLastActive:
      entity.status === 'active' && (await activeEntityCount(ctx.db, ctx.organizationId)) === 1,
  }
}

export async function archiveEntity(ctx: ServiceContext, id: string): Promise<Entity> {
  return ctx.db.transaction(async (tx) => {
    // Serialises archives so two can't both pass the "last active entity" check.
    await lockOrganization(tx, ctx.organizationId)
    const entity = await findVisible(ctx, tx, id, true)
    if (entity.status === 'archived')
      throw conflict('not_archivable', `${entity.name} is already archived.`)
    if ((await activeEntityCount(tx, ctx.organizationId)) <= 1) {
      throw conflict(
        'last_entity',
        `${ctx.organizationName} needs at least one active entity. Add another before archiving ${entity.name}.`,
      )
    }
    const limitedMembers = await membersOnlyThisEntity(tx, ctx.organizationId, id)
    const [row] = await tx
      .update(entities)
      .set({ status: 'archived', archivedAt: new Date() })
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
      metadata: { membersOnlyThisEntity: limitedMembers },
    })
    return toEntity(row)
  })
}
