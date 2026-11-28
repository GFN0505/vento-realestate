import {
  TITLE_DOCUMENTS,
  TITLE_STAGE_LABELS,
  type TitleDocumentType,
  type TitleStageStatus,
  type TitleStageType,
} from '@vento/shared'
import { recordAudit } from '@/modules/audit/audit.service'
import type { DbOrTx } from './client'
import type { LandSeedInput } from './seed-land'
import type { ParcelSeed } from './seed-land-data'

// The seed's backdated history: each parcel's Activity as if Ngozi had done it over the months.

/** The Lagos date `n` days before `today`. */
export function daysBefore(today: string, n: number): string {
  return new Date(Date.parse(`${today}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
}

/** Mid-morning in Lagos on that date, for backdated history. */
export const morningOf = (date: string, hour = 10): Date =>
  new Date(`${date}T${String(hour - 1).padStart(2, '0')}:00:00Z`)

export type HistoryItem = {
  at: Date
  doc: { type: TitleDocumentType; name?: string }
  documentId: string
  versionId: string
}

/** The parcel's Activity: added, its documents, each stage's last move, and titling. */
export async function writeHistory(
  tx: DbOrTx,
  input: LandSeedInput,
  parcel: { id: string; name: string; entityId: string },
  spec: ParcelSeed,
  when: {
    created: string
    today: string
    stageIds: Map<TitleStageType, string>
    history: HistoryItem[]
  },
): Promise<void> {
  const base = {
    organizationId: input.organizationId,
    actor: { userId: input.officer.id, name: input.officer.name },
    target: { type: 'parcel', id: parcel.id, label: parcel.name },
  }
  await recordAudit(tx, {
    ...base,
    action: 'land.parcel.created',
    at: morningOf(when.created),
    after: {
      name: spec.name,
      state: spec.state,
      lga: spec.lga,
      area: spec.area,
      size: `${spec.sizeHa} ha`,
      status: spec.status === 'titled' ? 'acquired' : spec.status,
      stages: spec.stages.map((s) => TITLE_STAGE_LABELS[s.type]).join(', '),
      acquiredOn: spec.acquiredOn ?? null,
      acquisitionCost: spec.cost ?? null,
      seller: spec.seller ? '(recorded)' : null,
    },
    // `seed` marks the parcel as the seed's own: a re-run refreshes it, never a hand-made one.
    metadata: { entityId: parcel.entityId, referenceNumber: spec.reference, seed: true },
  })
  for (const h of when.history) {
    await recordAudit(tx, {
      ...base,
      action: 'land.document.uploaded',
      at: h.at,
      metadata: {
        entityId: parcel.entityId,
        documentId: h.documentId,
        documentType: h.doc.type,
        versionId: h.versionId,
        versionNo: 1,
        stageType: TITLE_DOCUMENTS[h.doc.type].stageType,
      },
    })
  }
  for (const s of spec.stages.filter((x) => x.status !== 'not_started')) {
    const on = s.daysAgo === undefined ? when.created : daysBefore(when.today, s.daysAgo)
    await recordAudit(tx, {
      ...base,
      action: 'land.title_stage.updated',
      at: morningOf(on, 12),
      before: { status: 'not_started' },
      after: stageAfter(s, when.today),
      metadata: {
        entityId: parcel.entityId,
        stageId: when.stageIds.get(s.type),
        stageType: s.type,
        status: s.status,
        version: 2,
      },
    })
  }
  if (spec.status === 'titled') {
    const last = Math.min(...spec.stages.map((s) => s.daysAgo ?? spec.addedDaysAgo))
    await recordAudit(tx, {
      ...base,
      action: 'land.parcel.updated',
      at: morningOf(daysBefore(when.today, last), 13),
      before: { status: 'acquired' },
      after: { status: 'titled' },
      metadata: { entityId: parcel.entityId, automatic: 'titled' },
    })
  }
}

function stageAfter(s: ParcelSeed['stages'][number], today: string): Record<string, unknown> {
  const status: TitleStageStatus = s.status
  return {
    status,
    ...(s.daysAgo !== undefined && { statusOn: daysBefore(today, s.daysAgo) }),
    ...(s.reference && { reference: s.reference }),
    ...(s.issuedBy && { issuedBy: s.issuedBy }),
    ...(s.note && { note: s.note }),
    ...(s.followUpDaysAgo !== undefined && { followUpOn: daysBefore(today, s.followUpDaysAgo) }),
  }
}
