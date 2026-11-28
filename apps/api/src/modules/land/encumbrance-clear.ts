import { ENCUMBRANCE_LABELS, ENCUMBRANCE_WORDS, mostSerious } from '@vento/shared'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { StaleError } from '@/approvals/errors'
import { approvalMetadata, type ExecuteMeta, type ExecuteResult } from '@/approvals/plugin'
import type { DbOrTx } from '@/db/client'
import { encumbrances, titleDocuments, titleDocumentVersions } from '@/db/schema'
import { recordAudit } from '@/modules/audit/audit.service'
import { touchParcel } from './documents.service'
import { loadEncumbrance } from './encumbrance-read'
import { assertWritable, loadParcel, parcelTarget } from './land-access'

// Clearing an encumbrance (plan §6): what a clearing request stores, and the one function that
// sets `cleared`. It runs only as the approval's execute, as the maker, in the approving
// transaction (decision 0024). Nothing else writes `cleared`: the procedures' inputs are strict
// and the 0023 trigger freezes a cleared row.

export const encumbranceClearPayload = z.object({
  encumbranceId: z.uuid(),
  /** The encumbrance's version when asked; an edit since makes the request out of date. */
  version: z.number().int().min(1),
  parcelId: z.uuid(),
  /** The parcel's company when asked; a move since makes it out of date. */
  entityId: z.uuid(),
  clearedOn: z.iso.date(),
  /** The clearance evidence, filed in the vault when the request was sent. */
  clearanceDocumentId: z.uuid(),
  clearanceVersionId: z.uuid(),
  note: z.string().nullable(),
})
export type EncumbranceClearPayload = z.infer<typeof encumbranceClearPayload>

/** Another active encumbrance on the parcel that blocks sales, the most serious one. */
export async function otherBlocking(
  tx: DbOrTx,
  organizationId: string,
  parcelId: string,
  exceptId: string,
) {
  const rows = await tx
    .select({
      type: encumbrances.type,
      blocksSales: encumbrances.blocksSales,
      servedOn: encumbrances.servedOn,
    })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, organizationId),
        eq(encumbrances.parcelId, parcelId),
        eq(encumbrances.status, 'active'),
        eq(encumbrances.blocksSales, true),
        ne(encumbrances.id, exceptId),
      ),
    )
  return mostSerious(rows)
}

/** The clearance version is still in the vault, on that document of this parcel. */
async function clearanceKept(
  tx: DbOrTx,
  organizationId: string,
  p: EncumbranceClearPayload,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: titleDocumentVersions.id })
    .from(titleDocumentVersions)
    .innerJoin(
      titleDocuments,
      and(
        eq(titleDocuments.organizationId, titleDocumentVersions.organizationId),
        eq(titleDocuments.id, titleDocumentVersions.documentId),
      ),
    )
    .where(
      and(
        eq(titleDocumentVersions.organizationId, organizationId),
        eq(titleDocumentVersions.id, p.clearanceVersionId),
        eq(titleDocumentVersions.documentId, p.clearanceDocumentId),
        eq(titleDocuments.parcelId, p.parcelId),
        isNull(titleDocumentVersions.removedAt),
      ),
    )
  return Boolean(row)
}

/**
 * The last approval landed: re-check as the maker (parcel, company, version, evidence), then set
 * `cleared` and audit it with the approvers. Any change since the request throws StaleError and
 * the engine expires the request; the encumbrance stays active and keeps blocking.
 */
export async function applyEncumbranceClear(
  tx: DbOrTx,
  ctx: ServiceContext,
  p: EncumbranceClearPayload,
  meta: ExecuteMeta,
): Promise<ExecuteResult> {
  // Only ever after approvals (whenNoRule and whenNoApprover refuse): running any other way would
  // unblock sales on one person's word (review #4). The 0023 trigger refuses it too.
  if (meta.approvalRequestId === null) throw new StaleError('Clearing runs only after approval')
  // Lock order as every land write: the parcel, then the encumbrance.
  const parcel = await loadParcel(tx, ctx, p.parcelId, { lock: true })
  if (parcel.entityId !== p.entityId) throw new StaleError('The parcel moved company')
  assertWritable(parcel)
  const enc = await loadEncumbrance(tx, ctx, p.encumbranceId, { lock: true })
  if (enc.parcelId !== parcel.id || enc.status !== 'active' || enc.version !== p.version) {
    throw new StaleError('The encumbrance changed since the request')
  }
  if (!(await clearanceKept(tx, ctx.organizationId, p))) {
    throw new StaleError('The clearance evidence was removed')
  }
  await tx
    .update(encumbrances)
    .set({
      status: 'cleared',
      clearedOn: p.clearedOn,
      clearanceDocumentId: p.clearanceDocumentId,
      clearanceVersionId: p.clearanceVersionId,
      clearanceNote: p.note,
      clearedAt: new Date(),
      clearedByUserId: ctx.user.id,
      version: enc.version + 1,
    })
    .where(
      and(
        eq(encumbrances.organizationId, ctx.organizationId),
        eq(encumbrances.id, enc.id),
        eq(encumbrances.status, 'active'),
      ),
    )
  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    action: 'land.encumbrance.cleared',
    actor: actorOf(ctx),
    target: parcelTarget(parcel),
    before: { status: 'active' },
    // The note's words stay on the row (security M3): the trail says one was added.
    after: {
      status: 'cleared',
      clearedOn: p.clearedOn,
      ...(p.note && { clearanceNote: '(recorded)' }),
    },
    metadata: {
      entityId: parcel.entityId,
      encumbranceId: enc.id,
      encumbranceType: enc.type,
      blocksSales: enc.blocksSales,
      documentId: p.clearanceDocumentId,
      versionId: p.clearanceVersionId,
      ...approvalMetadata(meta),
    },
  })
  await touchParcel(tx, ctx, parcel.id)
  const still = enc.blocksSales
    ? await otherBlocking(tx, ctx.organizationId, parcel.id, enc.id)
    : null
  const label = ENCUMBRANCE_LABELS[enc.type]
  const notice = !enc.blocksSales
    ? `${label} cleared`
    : still
      ? `${label} cleared. Sales on ${parcel.name} are still blocked by the ${ENCUMBRANCE_WORDS[still.type]}.`
      : `${label} cleared. Sales on ${parcel.name} are unblocked.`
  return { notice, emails: [], afterCommit: null }
}
