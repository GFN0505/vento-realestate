import {
  ENCUMBRANCE_LABELS,
  ENCUMBRANCE_WORDS,
  type EncumbranceType,
  mostSerious,
} from '@vento/shared'
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { encumbrances, parcels } from '@/db/schema'
import { conflict } from '@/lib/errors'

// The sales block (decision 0027): a parcel is blocked while any of its encumbrances is active
// and blocks sales. Worked out from encumbrances_blocking_idx, never stored. Projects and Sales
// call assertParcelsNotBlocked before a reservation or subscription, and blockedParcels to show
// it; neither keeps its own copy or flag.

type Ctx = Pick<ServiceContext, 'organizationId'>

/** The most serious blocking encumbrance of a parcel, and how many other active ones it has. */
export type ParcelBlock = { type: EncumbranceType; reference: string | null; others: number }

/** `exists` for "this parcel is blocked", for lists and Home (correlated on `parcels`). */
export const parcelBlockedSql: SQL = sql`exists (select 1 from encumbrances e
  where e.organization_id = ${parcels.organizationId} and e.parcel_id = ${parcels.id}
    and e.status = 'active' and e.blocks_sales)`

type ActiveRow = {
  parcelId: string
  type: EncumbranceType
  blocksSales: boolean
  reference: string | null
  servedOn: string
}

/** Every active encumbrance of these parcels, in one query on the parcel index. */
async function activeOf(db: DbOrTx, ctx: Ctx, parcelIds: readonly string[]): Promise<ActiveRow[]> {
  if (parcelIds.length === 0) return []
  return db
    .select({
      parcelId: encumbrances.parcelId,
      type: encumbrances.type,
      blocksSales: encumbrances.blocksSales,
      reference: encumbrances.reference,
      servedOn: encumbrances.servedOn,
    })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, ctx.organizationId),
        inArray(encumbrances.parcelId, [...parcelIds]),
        eq(encumbrances.status, 'active'),
      ),
    )
}

function blocksOf(rows: readonly ActiveRow[]): Map<string, ParcelBlock> {
  const byParcel = new Map<string, ActiveRow[]>()
  for (const r of rows) byParcel.set(r.parcelId, [...(byParcel.get(r.parcelId) ?? []), r])
  const out = new Map<string, ParcelBlock>()
  for (const [parcelId, list] of byParcel) {
    const top = mostSerious(list.filter((r) => r.blocksSales))
    if (top)
      out.set(parcelId, { type: top.type, reference: top.reference, others: list.length - 1 })
  }
  return out
}

/** The blocked ones among these parcels of this organization, with what blocks each. */
export async function blockedParcels(
  db: DbOrTx,
  ctx: Ctx,
  parcelIds: readonly string[],
): Promise<Map<string, ParcelBlock>> {
  return blocksOf(await activeOf(db, ctx, parcelIds))
}

/** "Court order FHC/L/CS/1182/2026 blocks new sales on Plot 22, Folu Ayo." */
export function salesBlockedMessage(block: Omit<ParcelBlock, 'others'>, parcelName: string) {
  const what = block.reference
    ? `${ENCUMBRANCE_LABELS[block.type]} ${block.reference}`
    : `A ${ENCUMBRANCE_WORDS[block.type]}`
  return `${what} blocks new sales on ${parcelName}.`
}

/**
 * Refuses (CONFLICT `sales_blocked`) when any of these parcels is blocked, inside the caller's
 * transaction. The parcels are locked FOR SHARE first: recording an encumbrance locks its parcel
 * FOR UPDATE, so a reservation and a new court order on the same land run one after the other.
 * Organization only, not the caller's companies: the block holds whoever sells. An id that isn't
 * one of this organization's parcels throws (review #6): a unit always has its parcel, so a miss
 * is the caller's bug, and checking fewer parcels than asked would let a sale through.
 *
 * For Sales and Projects: never touchParcel (or any other write to these parcel rows) after this
 * check in the same transaction. Upgrading the FOR SHARE lock to a write deadlocks with a
 * recorder waiting on its FOR UPDATE; anything that must touch the parcel locks it first.
 */
export async function assertParcelsNotBlocked(
  tx: DbOrTx,
  ctx: Ctx,
  parcelIds: readonly string[],
): Promise<void> {
  if (parcelIds.length === 0) return
  const locked = await tx
    .select({ id: parcels.id, name: parcels.name })
    .from(parcels)
    .where(and(eq(parcels.organizationId, ctx.organizationId), inArray(parcels.id, [...parcelIds])))
    // A fixed order, so two callers locking overlapping sets can't deadlock.
    .orderBy(asc(parcels.id))
    .for('share')
  if (locked.length !== new Set(parcelIds).size) {
    throw new Error('assertParcelsNotBlocked: a parcel id is not in this organization')
  }
  const blocks = await blockedParcels(
    tx,
    ctx,
    locked.map((p) => p.id),
  )
  const first = locked.find((p) => blocks.has(p.id))
  const block = first && blocks.get(first.id)
  if (first && block) throw conflict('sales_blocked', salesBlockedMessage(block, first.name))
}
