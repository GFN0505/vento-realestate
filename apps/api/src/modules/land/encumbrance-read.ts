import {
  compareSeriousness,
  type Encumbrance,
  type EncumbranceFile,
  type EncumbranceType,
  mostSerious,
  type ParcelRow,
  type PendingApproval,
} from '@vento/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import { pendingApprovals } from '@/approvals/pending'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { auditEvents, encumbrances, parcels, titleDocuments, users } from '@/db/schema'
import { notFound } from '@/lib/errors'
import { type ActorStanding, actorFor, actorStandingOf } from '@/modules/audit/audit-read.service'
import { versionsOf } from './document-read'
import { parcelScope } from './land-access'

// How encumbrances read (plan §4): the list row's badge facts, batched by parcel ids, and the
// parcel page's list. Callers have already checked the parcel is in scope.

type Ctx = Pick<ServiceContext, 'organizationId' | 'member'>

/** What the writers need of a stored encumbrance. */
export type EncumbranceRecord = {
  id: string
  parcelId: string
  type: EncumbranceType
  status: Encumbrance['status']
  blocksSales: boolean
  claimant: string
  servedOn: string
  reference: string | null
  lawyer: string | null
  nextOn: string | null
  notes: string | null
  version: number
  evidenceDocumentId: string
  evidenceVersionId: string
}

/**
 * An encumbrance whose parcel is in scope (this organization, the member's companies), or
 * NOT_FOUND. `lock` takes the row `for update`; writers lock the parcel first, then this.
 */
export async function loadEncumbrance(
  db: DbOrTx,
  ctx: Ctx,
  id: string,
  options: { lock?: boolean } = {},
): Promise<EncumbranceRecord> {
  const query = db
    .select({
      id: encumbrances.id,
      parcelId: encumbrances.parcelId,
      type: encumbrances.type,
      status: encumbrances.status,
      blocksSales: encumbrances.blocksSales,
      claimant: encumbrances.claimant,
      servedOn: encumbrances.servedOn,
      reference: encumbrances.reference,
      lawyer: encumbrances.lawyer,
      nextOn: encumbrances.nextOn,
      notes: encumbrances.notes,
      version: encumbrances.version,
      evidenceDocumentId: encumbrances.evidenceDocumentId,
      evidenceVersionId: encumbrances.evidenceVersionId,
    })
    .from(encumbrances)
    .innerJoin(
      parcels,
      and(
        eq(parcels.organizationId, encumbrances.organizationId),
        eq(parcels.id, encumbrances.parcelId),
      ),
    )
    .where(and(parcelScope(ctx), eq(encumbrances.id, id)))
  const [row] = await (options.lock ? query.for('update', { of: encumbrances }) : query)
  if (!row) throw notFound()
  return row
}

export type EncumbranceSummary = NonNullable<ParcelRow['encumbrance']>

/**
 * Active encumbrances of these parcels as the list's badge reads them, in one query. The claimant
 * ("Mortgaged to …") only when `seesDetails` (canSeeEncumbranceDetails).
 */
export async function encumbranceSummaries(
  db: DbOrTx,
  organizationId: string,
  parcelIds: readonly string[],
  seesDetails: boolean,
): Promise<Map<string, EncumbranceSummary>> {
  const out = new Map<string, EncumbranceSummary>()
  if (parcelIds.length === 0) return out
  const rows = await db
    .select({
      parcelId: encumbrances.parcelId,
      type: encumbrances.type,
      blocksSales: encumbrances.blocksSales,
      claimant: encumbrances.claimant,
      servedOn: encumbrances.servedOn,
    })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, organizationId),
        inArray(encumbrances.parcelId, [...parcelIds]),
        eq(encumbrances.status, 'active'),
      ),
    )
  const byParcel = new Map<string, typeof rows>()
  for (const r of rows) byParcel.set(r.parcelId, [...(byParcel.get(r.parcelId) ?? []), r])
  for (const [parcelId, list] of byParcel) {
    const top = mostSerious(list)
    if (!top) continue
    out.set(parcelId, {
      blocked: list.some((r) => r.blocksSales),
      top: {
        type: top.type,
        blocksSales: top.blocksSales,
        claimant: seesDetails ? top.claimant : null,
      },
      count: list.length,
    })
  }
  return out
}

/** One stored encumbrance with who recorded it, as the parcel page needs it. */
export type EncumbranceRow = {
  id: string
  type: EncumbranceType
  status: Encumbrance['status']
  blocksSales: boolean
  claimant: string
  servedOn: string
  reference: string | null
  lawyer: string | null
  nextOn: string | null
  notes: string | null
  version: number
  evidenceDocumentId: string
  evidenceVersionId: string
  clearanceDocumentId: string | null
  clearanceVersionId: string | null
  clearedOn: string | null
  clearanceNote: string | null
  clearedAt: Date | null
  createdAt: Date
  recordedByUserId: string
  recordedByName: string
  recordedByStanding: ActorStanding
}

export async function encumbranceRows(
  db: DbOrTx,
  organizationId: string,
  parcelId: string,
): Promise<EncumbranceRow[]> {
  return db
    .select({
      id: encumbrances.id,
      type: encumbrances.type,
      status: encumbrances.status,
      blocksSales: encumbrances.blocksSales,
      claimant: encumbrances.claimant,
      servedOn: encumbrances.servedOn,
      reference: encumbrances.reference,
      lawyer: encumbrances.lawyer,
      nextOn: encumbrances.nextOn,
      notes: encumbrances.notes,
      version: encumbrances.version,
      evidenceDocumentId: encumbrances.evidenceDocumentId,
      evidenceVersionId: encumbrances.evidenceVersionId,
      clearanceDocumentId: encumbrances.clearanceDocumentId,
      clearanceVersionId: encumbrances.clearanceVersionId,
      clearedOn: encumbrances.clearedOn,
      clearanceNote: encumbrances.clearanceNote,
      clearedAt: encumbrances.clearedAt,
      createdAt: encumbrances.createdAt,
      recordedByUserId: encumbrances.recordedByUserId,
      recordedByName: users.name,
      recordedByStanding: actorStandingOf(
        encumbrances.recordedByUserId,
        encumbrances.organizationId,
      ),
    })
    .from(encumbrances)
    .innerJoin(users, eq(users.id, encumbrances.recordedByUserId))
    .where(
      and(eq(encumbrances.organizationId, organizationId), eq(encumbrances.parcelId, parcelId)),
    )
}

/** The approvers of each cleared one, in step order, from its `land.encumbrance.cleared` event. */
async function clearedApprovers(
  db: DbOrTx,
  organizationId: string,
  parcelId: string,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({
      encumbranceId: sql<string>`${auditEvents.metadata}->>'encumbranceId'`,
      approvedBy: sql<unknown>`${auditEvents.metadata}->'approvedBy'`,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.targetType, 'parcel'),
        eq(auditEvents.targetId, parcelId),
        eq(auditEvents.action, 'land.encumbrance.cleared'),
        inArray(sql`${auditEvents.metadata}->>'encumbranceId'`, [...ids]),
      ),
    )
  return new Map(rows.map((r) => [r.encumbranceId, approverNames(r.approvedBy)]))
}

function approverNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((a): a is { name: string; position: number } => {
      const o = a as { name?: unknown; position?: unknown }
      return typeof o?.name === 'string' && typeof o?.position === 'number'
    })
    .sort((a, b) => a.position - b.position)
    .map((a) => a.name)
}

/**
 * The pinned evidence and clearance versions (security M1), by version id: what each encumbrance
 * shows, whatever the vault holds now. Two queries for the whole parcel.
 */
async function pinnedFiles(
  db: DbOrTx,
  organizationId: string,
  rows: readonly EncumbranceRow[],
): Promise<Map<string, EncumbranceFile>> {
  const pins = rows.flatMap((r) => [
    { documentId: r.evidenceDocumentId, versionId: r.evidenceVersionId },
    ...(r.clearanceDocumentId && r.clearanceVersionId
      ? [{ documentId: r.clearanceDocumentId, versionId: r.clearanceVersionId }]
      : []),
  ])
  if (pins.length === 0) return new Map()
  const documentIds = [...new Set(pins.map((p) => p.documentId))]
  const [names, versions] = await runQueries(db, [
    () =>
      db
        .select({ id: titleDocuments.id, name: titleDocuments.name })
        .from(titleDocuments)
        .where(
          and(
            eq(titleDocuments.organizationId, organizationId),
            inArray(titleDocuments.id, documentIds),
          ),
        ),
    () => versionsOf(db, organizationId, documentIds),
  ])
  const nameOf = new Map(names.map((n) => [n.id, n.name ?? '']))
  const out = new Map<string, EncumbranceFile>()
  for (const pin of pins) {
    const version = versions.get(pin.documentId)?.find((v) => v.id === pin.versionId)
    if (!version) continue
    out.set(pin.versionId, {
      documentId: pin.documentId,
      name: nameOf.get(pin.documentId) ?? '',
      version,
    })
  }
  return out
}

/** What the parcel page reads besides the rows: pending clearing requests, approvers, files. */
export type EncumbranceExtras = {
  pending: Map<string, PendingApproval>
  approvers: Map<string, string[]>
  /** Empty when the viewer can't see encumbrance details. */
  files: Map<string, EncumbranceFile>
  seesDetails: boolean
}

export async function encumbranceExtras(
  db: DbOrTx,
  ctx: Ctx,
  parcelId: string,
  rows: readonly EncumbranceRow[],
  seesDetails: boolean,
): Promise<EncumbranceExtras> {
  const active = rows.filter((r) => r.status === 'active').map((r) => r.id)
  const cleared = rows.filter((r) => r.status === 'cleared').map((r) => r.id)
  const pending = await pendingApprovals(db, ctx, 'land.encumbrance.clear', 'encumbrance', active)
  const approvers = await clearedApprovers(db, ctx.organizationId, parcelId, cleared)
  const files = seesDetails ? await pinnedFiles(db, ctx.organizationId, rows) : new Map()
  return { pending, approvers, files, seesDetails }
}

/**
 * Active first (most serious first), then cleared, newest first. Claimant, lawyer, notes and
 * files only for people who can see encumbrance details (`extras.seesDetails`).
 */
export function toEncumbrances(
  rows: readonly EncumbranceRow[],
  extras: EncumbranceExtras,
): Encumbrance[] {
  const sees = extras.seesDetails
  const fileOf = (versionId: string | null) =>
    (sees && versionId && extras.files.get(versionId)) || null
  const active = rows.filter((r) => r.status === 'active').sort(compareSeriousness)
  const cleared = rows
    .filter((r) => r.status === 'cleared')
    .sort((a, b) => (b.clearedAt?.getTime() ?? 0) - (a.clearedAt?.getTime() ?? 0))
  return [...active, ...cleared].map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    blocksSales: r.blocksSales,
    detailsHidden: !sees,
    claimant: sees ? r.claimant : null,
    servedOn: r.servedOn,
    reference: r.reference,
    lawyer: sees ? r.lawyer : null,
    nextOn: r.nextOn,
    notes: sees ? r.notes : null,
    version: r.version,
    // Named as the audit log names people: someone outside the organization isn't.
    recordedBy: {
      name: actorFor({
        actorUserId: r.recordedByUserId,
        actorName: r.recordedByName,
        actorStanding: r.recordedByStanding,
      }).name,
    },
    recordedAt: r.createdAt.toISOString(),
    evidence: fileOf(r.evidenceVersionId),
    clearance:
      r.status === 'cleared' && r.clearedOn && r.clearedAt
        ? {
            clearedOn: r.clearedOn,
            note: sees ? r.clearanceNote : null,
            clearedAt: r.clearedAt.toISOString(),
            file: fileOf(r.clearanceVersionId),
            approvedBy: extras.approvers.get(r.id) ?? [],
          }
        : null,
    pendingClear: r.status === 'active' ? (extras.pending.get(r.id) ?? null) : null,
  }))
}
