import {
  Decimal,
  ENCUMBRANCE_WORDS,
  findLga,
  mostSerious,
  type NigerianState,
  type ParcelDetail,
  type ParcelRow,
  type ParcelStatus,
  sizeText,
  type updateParcelInput,
} from '@vento/shared'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { encumbrances, parcels } from '@/db/schema'
import { badRequest, conflict } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import {
  assertNotFuture,
  assertWritable,
  entityArchivedConflict,
  lastChangedBy,
  loadActiveEntity,
  loadParcel,
  type ParcelRecord,
  parcelTarget,
  sellerWords,
  staleConflict,
} from './land-access'
import { sizeColumns } from './parcel-create.service'
import { parcelDetail, parcelRow } from './parcel-read'
import { followStages } from './stage-write'

// Edit, archive and restore a parcel (plan §4). Every write locks the parcel first.

type UpdateInput = z.output<typeof updateParcelInput>

/** Projects and Sales own these; an edit never changes them (plan §3). */
const SET_ELSEWHERE: readonly ParcelStatus[] = ['in_development', 'sold_out']

type SizeFacts = Pick<ParcelRecord, 'sizeSqm' | 'sizeUnit' | 'sizeEntered' | 'plotSizeSqm'>

const sameDecimal = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : new Decimal(a).eq(b)

/**
 * Changed by what's stored, not by how it reads: 4.2 ha → 4.204 ha both read "4.20 ha" but
 * store different m² (review: such edits were dropped).
 */
export function sizeChanged(before: SizeFacts, after: SizeFacts): boolean {
  return (
    before.sizeUnit !== after.sizeUnit ||
    !sameDecimal(before.sizeSqm, after.sizeSqm) ||
    !sameDecimal(before.sizeEntered, after.sizeEntered) ||
    !sameDecimal(before.plotSizeSqm, after.plotSizeSqm)
  )
}

/** The audit words: as lists read them, or as typed when that reads the same ("4.204 ha"). */
function sizeWords(before: SizeFacts, after: SizeFacts): { before: string; after: string } {
  const b = sizeText(before)
  const a = sizeText(after)
  if (a !== b) return { before: b, after: a }
  const typed = (s: SizeFacts) =>
    `${new Decimal(s.sizeEntered).toFixed()} ${s.sizeUnit === 'sqm' ? 'm²' : s.sizeUnit}`
  return { before: typed(before), after: typed(after) }
}

/** The LGA as listed for the state the parcel will be in, or BAD_REQUEST with the spec copy. */
function lgaIn(state: NigerianState, lga: string): string {
  const found = findLga(state, lga)
  if (!found) throw badRequest('lga_not_in_state', `Pick an LGA in ${state}.`)
  return found
}

type Change = { column: Partial<typeof parcels.$inferInsert>; before: unknown; after: unknown }

/** What the input changes, column by column, with the words the audit trail keeps. */
async function changesOf(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcel: ParcelRecord,
  input: UpdateInput,
): Promise<Record<string, Change>> {
  const out: Record<string, Change> = {}
  const set = (key: string, column: Change['column'], before: unknown, after: unknown) => {
    if (before !== after) out[key] = { column, before, after }
  }
  if (input.name !== undefined) set('name', { name: input.name }, parcel.name, input.name)
  if (input.state !== undefined || input.lga !== undefined) {
    const state = (input.state ?? parcel.state) as NigerianState
    const lga = lgaIn(state, input.lga ?? parcel.lga)
    set('state', { state }, parcel.state, state)
    set('lga', { lga }, parcel.lga, lga)
  }
  if (input.area !== undefined) set('area', { area: input.area }, parcel.area, input.area)
  if (input.size) {
    const size = sizeColumns(input.size)
    if (sizeChanged(parcel, size)) {
      const words = sizeWords(parcel, size)
      out.size = { column: size, before: words.before, after: words.after }
    }
  }
  if (input.entityId !== undefined && input.entityId !== parcel.entityId) {
    // Named when read (metadata fromEntityId → entityId), so the trail keeps ids, not names.
    const entity = await loadActiveEntity(tx, ctx, input.entityId)
    out.company = { column: { entityId: entity.id }, before: undefined, after: undefined }
  }
  if (input.status !== undefined && !SET_ELSEWHERE.includes(parcel.status)) {
    // Choosing Acquired on a titled parcel keeps it titled (the stages decide).
    const chosen =
      parcel.status === 'titled' && input.status === 'acquired' ? 'titled' : input.status
    set('status', { status: chosen }, parcel.status, chosen)
  }
  if (input.acquiredOn !== undefined) {
    assertNotFuture(input.acquiredOn)
    const v = input.acquiredOn ?? null
    set('acquiredOn', { acquiredOn: v }, parcel.acquiredOn, v)
  }
  if (input.acquisitionCost !== undefined) {
    const v = input.acquisitionCost ?? null
    set('acquisitionCost', { acquisitionCost: v }, parcel.acquisitionCost, v)
  }
  if (input.seller !== undefined && input.seller !== parcel.seller) {
    out.seller = {
      column: { seller: input.seller },
      before: parcel.seller ? '(recorded)' : null,
      after: sellerWords(parcel.seller, input.seller),
    }
  }
  if (input.notes !== undefined) set('notes', { notes: input.notes }, parcel.notes, input.notes)
  return out
}

/** The trail's words per changed field; a company move is in metadata only. */
function auditValues(changes: Record<string, Change>, side: 'before' | 'after') {
  return Object.fromEntries(
    Object.entries(changes)
      .filter(([k]) => k !== 'company')
      .map(([k, c]) => [k, c[side] ?? null]),
  )
}

/**
 * Edit parcel: only the fields sent. The version must be the one loaded (else CONFLICT `stale`
 * naming who saved). Moving to another company needs both in the editor's companies. The status
 * then follows the stages, as after any stage change.
 */
export async function updateParcel(ctx: ServiceContext, input: UpdateInput): Promise<ParcelDetail> {
  return ctx.db.transaction(async (tx) => {
    const parcel = await loadParcel(tx, ctx, input.id, { lock: true })
    assertWritable(parcel)
    if (parcel.version !== input.expectedVersion) {
      throw staleConflict(await lastChangedBy(tx, ctx.organizationId, parcel.id), 'parcel')
    }
    const changes = await changesOf(tx, ctx, parcel, input)
    const keys = Object.keys(changes)
    if (keys.length === 0) return parcelDetail(tx, ctx, parcel.id)
    const columns = Object.assign({}, ...keys.map((k) => changes[k]?.column))
    await tx
      .update(parcels)
      .set({ ...columns, version: sql`${parcels.version} + 1` })
      .where(and(eq(parcels.organizationId, ctx.organizationId), eq(parcels.id, parcel.id)))
    const entityId = (columns.entityId as string | undefined) ?? parcel.entityId
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.parcel.updated',
      actor: actorOf(ctx),
      target: parcelTarget({ id: parcel.id, name: (columns.name as string) ?? parcel.name }),
      before: auditValues(changes, 'before'),
      after: auditValues(changes, 'after'),
      metadata: {
        entityId,
        ...(entityId !== parcel.entityId && { fromEntityId: parcel.entityId }),
      },
    })
    const status = (columns.status as ParcelStatus | undefined) ?? parcel.status
    await followStages(tx, ctx, { ...parcel, entityId, status })
    return parcelDetail(tx, ctx, parcel.id)
  })
}

/**
 * Archive: leaves the list, stays reachable read-only by link, documents kept. Archiving an
 * archived parcel answers it as it is (Undo double-clicks). Refused while an encumbrance is
 * active (titling isn't affected); the 0023 trigger backs it up.
 */
export async function archiveParcel(ctx: ServiceContext, id: string): Promise<ParcelRow> {
  return setArchived(ctx, id, true)
}

/** Restore (and Undo of archive). */
export async function restoreParcel(ctx: ServiceContext, id: string): Promise<ParcelRow> {
  return setArchived(ctx, id, false)
}

async function setArchived(ctx: ServiceContext, id: string, archive: boolean): Promise<ParcelRow> {
  return ctx.db.transaction(async (tx) => {
    const parcel = await loadParcel(tx, ctx, id, { lock: true })
    if (parcel.entityArchived) throw entityArchivedConflict(parcel.entityName)
    if (archive && !parcel.archivedAt) await refuseIfEncumbered(tx, ctx, parcel.id)
    const [row] = await tx
      .update(parcels)
      .set({
        ...(archive
          ? { archivedAt: new Date(), archivedByUserId: ctx.user.id }
          : { archivedAt: null, archivedByUserId: null }),
        // An edit sheet opened before the archive must not save over it (VERSION_EVENTS).
        version: sql`${parcels.version} + 1`,
      })
      .where(
        and(
          eq(parcels.organizationId, ctx.organizationId),
          eq(parcels.id, id),
          archive ? isNull(parcels.archivedAt) : isNotNull(parcels.archivedAt),
        ),
      )
      .returning({ id: parcels.id })
    if (row) {
      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        action: archive ? 'land.parcel.archived' : 'land.parcel.restored',
        actor: actorOf(ctx),
        target: parcelTarget(parcel),
        metadata: { entityId: parcel.entityId },
      })
    }
    return parcelRow(tx, ctx, id)
  })
}

/** "Clear the caveat before archiving this parcel.", naming the most serious active one. */
async function refuseIfEncumbered(tx: DbOrTx, ctx: ServiceContext, parcelId: string) {
  const active = await tx
    .select({
      type: encumbrances.type,
      blocksSales: encumbrances.blocksSales,
      servedOn: encumbrances.servedOn,
    })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, ctx.organizationId),
        eq(encumbrances.parcelId, parcelId),
        eq(encumbrances.status, 'active'),
      ),
    )
  const top = mostSerious(active)
  if (!top) return
  throw conflict(
    'encumbered',
    `Clear the ${ENCUMBRANCE_WORDS[top.type]} before archiving this parcel.`,
  )
}
