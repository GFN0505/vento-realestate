import { type ApprovalChange, ENCUMBRANCE_LABELS, ENCUMBRANCE_WORDS } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { ApprovalPlugin, ExecuteResult } from '@/approvals/plugin'
import type { DbOrTx } from '@/db/client'
import { titleDocuments, titleDocumentVersions } from '@/db/schema'
import {
  applyEncumbranceClear,
  type EncumbranceClearPayload,
  encumbranceClearPayload,
  otherBlocking,
} from './encumbrance-clear'
import { dateWords } from './encumbrance-emails'
import { loadEncumbrance } from './encumbrance-read'
import { loadParcel } from './land-access'

// "Clear an encumbrance" (land.encumbrance.clear, plan §6). Every clearing waits for its rule's
// approvals and refuses without one (decision 0026). Approvers need Land & title approve and
// access to the parcel's company (the engine checks both); nobody is excluded beyond the maker.

/**
 * "Clearance · Caveat · CV/LAG/2026/114 (v1)": the clearance version by its vault name, never the
 * uploaded file's own name (security M3: it can carry a family's name into emails and the inbox).
 */
async function versionLabel(
  tx: DbOrTx,
  organizationId: string,
  versionId: string,
): Promise<string> {
  const [row] = await tx
    .select({ name: titleDocuments.name, versionNo: titleDocumentVersions.versionNo })
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
        eq(titleDocumentVersions.id, versionId),
      ),
    )
  return row ? `${row.name ?? 'Evidence'} (v${row.versionNo})` : 'Attached'
}

export const encumbranceClearPlugin: ApprovalPlugin<EncumbranceClearPayload, ExecuteResult> = {
  key: 'land.encumbrance.clear',
  permission: { module: 'land', action: 'edit' },
  // Asking files the clearance evidence (security L5).
  alsoRequires: [{ module: 'land', action: 'create' }],
  payload: encumbranceClearPayload,
  subject: (p) => ({ type: 'encumbrance', id: p.encumbranceId }),
  async describe(tx, ctx, p) {
    const enc = await loadEncumbrance(tx, ctx, p.encumbranceId)
    const parcel = await loadParcel(tx, ctx, enc.parcelId)
    const label = ENCUMBRANCE_LABELS[enc.type]
    const word = ENCUMBRANCE_WORDS[enc.type]
    const still = enc.blocksSales
      ? await otherBlocking(tx, ctx.organizationId, parcel.id, enc.id)
      : null
    const changes: ApprovalChange[] = [
      { field: 'Status', before: 'Active', after: 'Cleared' },
      { field: 'Cleared on', before: null, after: dateWords(p.clearedOn) },
      {
        field: 'Evidence',
        before: null,
        after: await versionLabel(tx, ctx.organizationId, p.clearanceVersionId),
        // The exact version asked with (security M1): approvers open what will be pinned.
        link: `/land/${parcel.id}?tab=encumbrances&preview=${p.clearanceVersionId}`,
      },
      ...(enc.blocksSales
        ? [
            {
              field: 'Sales on this parcel',
              before: 'Blocked',
              after: still ? `Still blocked by the ${ENCUMBRANCE_WORDS[still.type]}` : 'Unblocked',
            },
          ]
        : []),
      // Never the note's words (security M3): summaries reach emails and the inbox.
      ...(p.note ? [{ field: 'Note', before: null, after: 'Note added' }] : []),
    ]
    return {
      entityId: parcel.entityId,
      summary: {
        title: `Clear ${word} · ${parcel.name}`,
        recordLabel: `${label} on ${parcel.name}`,
        recordLink: `/land/${parcel.id}?tab=encumbrances`,
        amount: null,
        changes,
        actionLabel:
          enc.blocksSales && !still ? `Clear ${word} and unblock sales` : `Clear ${word}`,
      },
    }
  },
  excluded: async () => [],
  execute: (tx, ctx, p, meta) => applyEncumbranceClear(tx, ctx, p, meta),
  async appliesTo(tx, ctx, subject) {
    if (subject.type !== 'encumbrance') return { applies: false, entityId: null }
    // Outside the viewer's companies or organization: NOT_FOUND, as every land id. The company
    // is the parcel's, read here, never the caller's (security M4).
    const enc = await loadEncumbrance(tx, ctx, subject.id)
    const parcel = await loadParcel(tx, ctx, enc.parcelId)
    return { applies: enc.status === 'active', entityId: parcel.entityId }
  },
}
