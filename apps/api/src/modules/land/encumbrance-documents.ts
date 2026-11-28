import { ENCUMBRANCE_WORDS, type EncumbranceType, type TitleDocumentType } from '@vento/shared'
import { and, eq, or, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { approvalRequests, encumbrances } from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { canSeeEncumbranceDetails } from './land-visibility'

// What the vault may do with an encumbrance's documents (security M1). The encumbrance shows the
// versions pinned on it, so those stay; a cleared one's documents are frozen; and a clearing
// request's document takes no new version while approvers are looking at it.

type Ctx = Pick<ServiceContext, 'organizationId' | 'member'>

/** Encumbrance evidence is an encumbrance detail: for anyone else it isn't there (NOT_FOUND). */
export function assertDocumentVisible(ctx: Pick<Ctx, 'member'>, type: TitleDocumentType): void {
  if (type === 'encumbrance_evidence' && !canSeeEncumbranceDetails(ctx.member)) throw notFound()
}

/** The pending clearing request whose clearance is this document (or this version), if any. */
async function pendingClearingFor(
  tx: DbOrTx,
  ctx: Ctx,
  pin: { documentId: string } | { versionId: string },
): Promise<{ type: EncumbranceType } | null> {
  const match =
    'documentId' in pin
      ? sql`${approvalRequests.payload}->>'clearanceDocumentId' = ${pin.documentId}`
      : sql`${approvalRequests.payload}->>'clearanceVersionId' = ${pin.versionId}`
  const [row] = await tx
    .select({ type: encumbrances.type })
    .from(approvalRequests)
    .innerJoin(
      encumbrances,
      and(
        eq(encumbrances.organizationId, approvalRequests.organizationId),
        eq(encumbrances.id, approvalRequests.subjectId),
      ),
    )
    .where(
      and(
        eq(approvalRequests.organizationId, ctx.organizationId),
        eq(approvalRequests.actionKey, 'land.encumbrance.clear'),
        eq(approvalRequests.subjectType, 'encumbrance'),
        eq(approvalRequests.status, 'pending'),
        match,
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * A new version of an encumbrance document (a better scan, from the vault): refused on any
 * document of a cleared encumbrance, and on the clearance document of a request that waits.
 * Evidence of an active encumbrance takes one; the encumbrance still shows its pinned version.
 * The caller holds the parcel's lock, which clearing and asking to clear take too.
 */
export async function assertAcceptsVersion(
  tx: DbOrTx,
  ctx: Ctx,
  documentId: string,
): Promise<void> {
  const [cleared] = await tx
    .select({ type: encumbrances.type })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, ctx.organizationId),
        eq(encumbrances.status, 'cleared'),
        or(
          eq(encumbrances.evidenceDocumentId, documentId),
          eq(encumbrances.clearanceDocumentId, documentId),
        ),
      ),
    )
    .limit(1)
  if (cleared) {
    throw conflict(
      'encumbrance_cleared',
      `This ${ENCUMBRANCE_WORDS[cleared.type]} is cleared, so its documents can't change.`,
    )
  }
  const pending = await pendingClearingFor(tx, ctx, { documentId })
  if (pending) {
    throw conflict(
      'clearing_pending',
      `A request to clear this ${ENCUMBRANCE_WORDS[pending.type]} is waiting. Cancel it to add a version.`,
    )
  }
}

/**
 * A version an encumbrance shows (its evidence or its clearance), or that a waiting clearing
 * request names, stays: CONFLICT `evidence_for_encumbrance`. Backed by the 0023 trigger for the
 * pinned ones.
 */
export async function refuseIfPinned(tx: DbOrTx, ctx: Ctx, versionId: string): Promise<void> {
  const [pinned] = await tx
    .select({ type: encumbrances.type })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, ctx.organizationId),
        or(
          eq(encumbrances.evidenceVersionId, versionId),
          eq(encumbrances.clearanceVersionId, versionId),
        ),
      ),
    )
    .limit(1)
  const owner = pinned ?? (await pendingClearingFor(tx, ctx, { versionId }))
  if (!owner) return
  throw conflict(
    'evidence_for_encumbrance',
    `This is the evidence for the ${ENCUMBRANCE_WORDS[owner.type]}, so it stays in the vault.`,
  )
}
