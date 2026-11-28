import {
  hasPermission,
  type ParcelStatus,
  type PermissionAction,
  type SizeUnit,
} from '@vento/shared'
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { MemberContext, ServiceContext } from '@/access/context'
import { entityScope } from '@/access/entity-scope'
import { whoCanGrant } from '@/access/who-can-grant'
import type { DbOrTx } from '@/db/client'
import { auditEvents, entities, parcels } from '@/db/schema'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import { lagosIsoDate } from '@/lib/format'
import { ACTOR_STANDING, actorFor } from '@/modules/audit/audit-read.service'
import { canSeeAcquisition } from './land-visibility'

// Who may see and change which parcel (plan §5). A parcel outside the member's companies reads as
// missing (NOT_FOUND), whatever the id; documents, versions and stages reach scope through it.

/**
 * The acquisition cost and date, and "Bought from": people who can edit Land & title or view
 * Finance (spec question 5; the seller follows the cost rule, owner 28 Nov 2026).
 */
export const canSeeCost: (member: Pick<MemberContext, 'permissions'>) => boolean = canSeeAcquisition

/**
 * "Bought from" in the audit trail: whether one was recorded or changed, never the name (it's
 * personal data; the parcel row holds it, shown only to people who may see it).
 */
export function sellerWords(before: string | null, after: string | null): string | null {
  if (!after) return null
  return before ? '(changed)' : '(recorded)'
}

/** This organization's parcels within the member's companies. */
export function parcelScope(ctx: Pick<ServiceContext, 'organizationId' | 'member'>): SQL {
  return and(
    eq(parcels.organizationId, ctx.organizationId),
    entityScope(ctx.member, parcels.entityId),
  ) as SQL
}

/** The stored parcel with its company, as services read it (cost only when it may be seen). */
export type ParcelRecord = {
  id: string
  entityId: string
  entityName: string
  entityArchived: boolean
  referenceNumber: number
  name: string
  state: string
  lga: string
  area: string | null
  sizeSqm: string
  sizeUnit: SizeUnit
  sizeEntered: string
  plotSizeSqm: string | null
  status: ParcelStatus
  acquiredOn: string | null
  acquisitionCost: string | null
  seller: string | null
  notes: string | null
  version: number
  archivedAt: Date | null
  updatedAt: Date
}

/** The columns of a ParcelRecord; cost, date and seller are never selected for someone who can't see them. */
export function parcelColumns(ctx: Pick<ServiceContext, 'member'>) {
  const sees = canSeeCost(ctx.member)
  return {
    id: parcels.id,
    entityId: parcels.entityId,
    entityName: entities.name,
    entityArchived: sql<boolean>`${entities.status} = 'archived'`,
    referenceNumber: parcels.referenceNumber,
    name: parcels.name,
    state: parcels.state,
    lga: parcels.lga,
    area: parcels.area,
    sizeSqm: parcels.sizeSqm,
    sizeUnit: parcels.sizeUnit,
    sizeEntered: parcels.sizeEntered,
    plotSizeSqm: parcels.plotSizeSqm,
    status: parcels.status,
    acquiredOn: sees ? parcels.acquiredOn : sql<string | null>`null`,
    acquisitionCost: sees ? parcels.acquisitionCost : sql<string | null>`null`,
    seller: sees ? parcels.seller : sql<string | null>`null`,
    notes: parcels.notes,
    version: parcels.version,
    archivedAt: parcels.archivedAt,
    updatedAt: parcels.updatedAt,
  }
}

/** Joins a parcel to its company (same organization by the composite key). */
export const parcelEntityJoin = and(
  eq(entities.organizationId, parcels.organizationId),
  eq(entities.id, parcels.entityId),
)

/**
 * A parcel in scope, or NOT_FOUND. `lock` takes the parcel row `for update`: every land write
 * locks its parcel first (then stages or documents), so changes to one parcel run one at a time.
 */
export async function loadParcel(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
  id: string,
  options: { lock?: boolean } = {},
): Promise<ParcelRecord> {
  const query = db
    .select(parcelColumns(ctx))
    .from(parcels)
    .innerJoin(entities, parcelEntityJoin)
    .where(and(parcelScope(ctx), eq(parcels.id, id)))
  const [row] = await (options.lock ? query.for('update', { of: parcels }) : query)
  if (!row) throw notFound()
  return row
}

/** Archived parcels and parcels of an archived company are read-only. */
export function readOnlyReason(
  parcel: Pick<ParcelRecord, 'archivedAt' | 'entityArchived'>,
): 'archived' | 'entity_archived' | null {
  if (parcel.archivedAt) return 'archived'
  return parcel.entityArchived ? 'entity_archived' : null
}

export function entityArchivedConflict(entityName: string) {
  return conflict(
    'entity_archived',
    `${entityName} is archived. Restore the company to change this parcel.`,
  )
}

/** CONFLICT `parcel_archived` / `entity_archived` with the spec copy, or nothing. */
export function assertWritable(
  parcel: Pick<ParcelRecord, 'archivedAt' | 'entityArchived' | 'entityName'>,
): void {
  const reason = readOnlyReason(parcel)
  if (reason === 'archived') {
    throw conflict('parcel_archived', 'This parcel is archived. Restore it to change it.')
  }
  if (reason === 'entity_archived') throw entityArchivedConflict(parcel.entityName)
}

/**
 * A company the member may put a parcel under: in this organization and their companies (else
 * NOT_FOUND), and active (else CONFLICT `entity_archived`).
 */
export async function loadActiveEntity(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
  entityId: string,
): Promise<{ id: string; name: string }> {
  const [row] = await db
    .select({ id: entities.id, name: entities.name, status: entities.status })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, ctx.organizationId),
        eq(entities.id, entityId),
        entityScope(ctx.member, entities.id),
      ),
    )
  if (!row) throw notFound()
  if (row.status === 'archived') {
    throw conflict('entity_archived', `${row.name} is archived. Choose another company.`)
  }
  return { id: row.id, name: row.name }
}

/** The events that move a parcel's version; uploads and links don't, so they never name anyone. */
export const VERSION_EVENTS = [
  'land.parcel.created',
  'land.parcel.updated',
  'land.parcel.archived',
  'land.parcel.restored',
  'land.title_stages.changed',
] as const

/**
 * Who last changed the parcel, from its audit trail ("Someone" if the trail doesn't say), named
 * as the audit log names them (someone outside the organization isn't).
 */
export async function lastChangedBy(
  db: DbOrTx,
  organizationId: string,
  parcelId: string,
): Promise<string> {
  const [row] = await db
    .select({
      actorUserId: auditEvents.actorUserId,
      actorName: auditEvents.actorName,
      actorStanding: ACTOR_STANDING,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.targetType, 'parcel'),
        eq(auditEvents.targetId, parcelId),
        inArray(auditEvents.action, [...VERSION_EVENTS]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(1)
  return row ? actorFor(row).name : 'Someone'
}

export function staleConflict(name: string, what: 'parcel' | 'stage') {
  const verb = what === 'stage' ? 'updated this stage' : 'changed this parcel'
  return conflict('stale', `${name} ${verb} a moment ago. Check the latest, then save again.`, {
    changedByName: name,
  })
}

/** Today in Lagos, "2026-11-28": the latest date a stage, document or acquisition may carry. */
export function lagosToday(now: Date = new Date()): string {
  return lagosIsoDate(now)
}

export function assertNotFuture(date: string | null | undefined, today = lagosToday()): void {
  if (date && date > today) throw badRequest('future_date', 'Enter a date on or before today.')
}

/** A FORBIDDEN refusal inside a service, worded as the middleware's would be. */
export async function assertPermission(
  ctx: Pick<ServiceContext, 'db' | 'organizationId' | 'member' | 'user'>,
  action: PermissionAction,
  doing: string,
): Promise<void> {
  if (hasPermission(ctx.member.permissions, 'land', action)) return
  const advice = await whoCanGrant(ctx.db, {
    organizationId: ctx.organizationId,
    module: 'land',
    action,
    doing,
    excludeUserId: ctx.user.id,
  })
  throw forbidden(
    'permission',
    advice.message,
    advice.askName && advice.askRole
      ? { askName: advice.askName, askRole: advice.askRole }
      : undefined,
  )
}

/** The parcel as an audit target: every land event points here (one index for Activity). */
export function parcelTarget(parcel: Pick<ParcelRecord, 'id' | 'name'>) {
  return { type: 'parcel', id: parcel.id, label: parcel.name }
}
