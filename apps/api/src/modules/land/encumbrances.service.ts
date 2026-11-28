import {
  ENCUMBRANCE_WORDS,
  encumbranceSuffix,
  NEXT_ON_TOO_EARLY,
  nextOnBounds,
  nextOnProblem,
  type ParcelDetail,
  type recordEncumbranceInput,
  type requestClearInput,
  type updateEncumbranceInput,
} from '@vento/shared'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { expireOnRead, requestOrRun } from '@/approvals/engine'
import { alreadyPending } from '@/approvals/errors'
import type { DbOrTx } from '@/db/client'
import { approvalRequests, auditEvents, encumbrances, titleDocuments } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { badRequest, conflict } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import { ACTOR_STANDING, actorFor } from '@/modules/audit/audit-read.service'
import { keepUpload } from '@/modules/files/files.records'
import { encumbranceClearPlugin } from './approvals'
import { touchParcel } from './documents.service'
import { addVersion } from './documents-write'
import type { EncumbranceClearPayload } from './encumbrance-clear'
import { dateWords, encumbranceRecordedEmails } from './encumbrance-emails'
import { type EncumbranceRecord, loadEncumbrance } from './encumbrance-read'
import {
  assertNotFuture,
  assertPermission,
  assertWritable,
  lagosToday,
  loadParcel,
  type ParcelRecord,
  parcelTarget,
  sellerWords,
} from './land-access'
import { parcelDetail } from './parcel-read'

// Encumbrances (plan §2–§6): record, edit details, and ask to clear. Recording blocks sales in
// its own transaction (decision 0027); clearing only asks, and applyEncumbranceClear sets
// `cleared` on the last approval. Every write locks the parcel, then the encumbrance.

type RecordInput = z.output<typeof recordEncumbranceInput>
type UpdateInput = z.output<typeof updateEncumbranceInput>
type ClearInput = z.output<typeof requestClearInput>

/** Names are capped at 80 (title_documents_name_length), with room for " (2)". */
const NAME_ROOM = 75

/**
 * A document name no other encumbrance document on the parcel uses: the base, or "base (2)",
 * "base (3)"… Under the parcel's lock, so two records can't pick the same one.
 */
async function freeName(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcelId: string,
  wanted: string,
): Promise<string> {
  const base = wanted.length > NAME_ROOM ? wanted.slice(0, NAME_ROOM).trimEnd() : wanted
  const rows = await tx
    .select({ name: sql<string>`lower(${titleDocuments.name})` })
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.organizationId, ctx.organizationId),
        eq(titleDocuments.parcelId, parcelId),
        eq(titleDocuments.type, 'encumbrance_evidence'),
      ),
    )
  const taken = new Set(rows.map((r) => r.name))
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} (${n})`
    if (!taken.has(name.toLowerCase())) return name
  }
}

/** "Caveat · CV/LAG/2026/114", or "Caveat · 4 Nov 2026" without a reference. */
function suffixOf(e: Pick<EncumbranceRecord, 'type' | 'reference' | 'servedOn'>): string {
  return encumbranceSuffix(e.type, e.reference, dateWords(e.servedOn))
}

/** The fields an edit may change. */
const DETAIL_KEYS = ['claimant', 'servedOn', 'reference', 'lawyer', 'nextOn', 'notes'] as const
type DetailKey = (typeof DETAIL_KEYS)[number]

/**
 * Personal or free text: the audit trail keeps only that one was recorded or changed (security
 * M3), as it does for the seller. The row holds the words, shown only to people who may see them.
 */
const MARKED_KEYS: readonly DetailKey[] = ['claimant', 'lawyer', 'notes']

/** What the audit trail keeps for a field going from `before` to `after`. */
function auditWords(
  key: DetailKey,
  before: string | null,
  after: string | null,
): { before: string | null; after: string | null } {
  if (!MARKED_KEYS.includes(key)) return { before, after }
  return { before: before ? '(recorded)' : null, after: sellerWords(before, after) }
}

/** BAD_REQUEST `next_on_out_of_range` when a next date is outside nextOnBounds (security L6). */
function assertNextOn(nextOn: string | null | undefined, servedOn: string): void {
  if (!nextOn) return
  const problem = nextOnProblem(nextOn, servedOn, lagosToday())
  if (problem) throw badRequest('next_on_out_of_range', `${problem}.`)
}

function encumbranceMetadata(
  parcel: Pick<ParcelRecord, 'entityId'>,
  e: Pick<EncumbranceRecord, 'id' | 'type' | 'blocksSales'>,
) {
  return {
    entityId: parcel.entityId,
    encumbranceId: e.id,
    encumbranceType: e.type,
    blocksSales: e.blocksSales,
  }
}

/**
 * Record an encumbrance: saved active with its evidence filed in the vault (named after it), and
 * from that moment a blocking one blocks sales on the parcel. Owners in the parcel's company
 * are emailed after commit (the router sends what this returns).
 */
export async function recordEncumbrance(
  ctx: ServiceContext,
  input: RecordInput,
): Promise<{ parcel: ParcelDetail; emails: EmailMessage[] }> {
  assertNotFuture(input.servedOn)
  assertNextOn(input.nextOn, input.servedOn)
  // The bucket copy runs before the parcel's lock is taken (keepUpload is idempotent).
  await keepUpload(ctx, input.evidence.fileId, 'title_document')
  return ctx.db.transaction(async (tx) => {
    // FOR UPDATE: a sale checking the block (FOR SHARE) waits for this, or this for it.
    const parcel = await loadParcel(tx, ctx, input.parcelId, { lock: true })
    assertWritable(parcel)
    const name = await freeName(tx, ctx, parcel.id, suffixOf(input))
    const evidence = await addVersion(tx, ctx, parcel, {
      type: 'encumbrance_evidence',
      name,
      separate: true,
      fileId: input.evidence.fileId,
      file: 'kept',
    })
    const [row] = await tx
      .insert(encumbrances)
      .values({
        organizationId: ctx.organizationId,
        parcelId: parcel.id,
        type: input.type,
        blocksSales: input.blocksSales,
        claimant: input.claimant,
        servedOn: input.servedOn,
        reference: input.reference,
        lawyer: input.lawyer,
        nextOn: input.nextOn ?? null,
        notes: input.notes,
        evidenceDocumentId: evidence.documentId,
        evidenceVersionId: evidence.versionId,
        recordedByUserId: ctx.user.id,
      })
      .returning({ id: encumbrances.id })
    if (!row) throw new Error('encumbrances insert returned nothing')
    const details = {
      type: input.type,
      claimant: auditWords('claimant', null, input.claimant).after,
      servedOn: input.servedOn,
      reference: input.reference,
      lawyer: auditWords('lawyer', null, input.lawyer).after,
      nextOn: input.nextOn ?? null,
      notes: auditWords('notes', null, input.notes).after,
    }
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.encumbrance.recorded',
      actor: actorOf(ctx),
      target: parcelTarget(parcel),
      after: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== null)),
      metadata: {
        ...encumbranceMetadata(parcel, { id: row.id, ...input }),
        documentId: evidence.documentId,
        versionId: evidence.versionId,
      },
    })
    await touchParcel(tx, ctx, parcel.id)
    const emails = await encumbranceRecordedEmails(tx, ctx, {
      parcel,
      type: input.type,
      servedOn: input.servedOn,
      blocksSales: input.blocksSales,
    })
    return { parcel: await parcelDetail(tx, ctx, parcel.id), emails }
  })
}

/** The parcel and the encumbrance, locked in that order, for a write. */
async function lockBoth(tx: DbOrTx, ctx: ServiceContext, id: string) {
  const found = await loadEncumbrance(tx, ctx, id)
  const parcel = await loadParcel(tx, ctx, found.parcelId, { lock: true })
  const enc = await loadEncumbrance(tx, ctx, id, { lock: true })
  assertWritable(parcel)
  return { parcel, enc }
}

function clearedConflict(e: Pick<EncumbranceRecord, 'type'>) {
  return conflict(
    'encumbrance_cleared',
    `This ${ENCUMBRANCE_WORDS[e.type]} is cleared, so it can't change.`,
  )
}

/** The events that move an encumbrance's version. */
const ENCUMBRANCE_VERSION_EVENTS = [
  'land.encumbrance.recorded',
  'land.encumbrance.updated',
  'land.encumbrance.cleared',
] as const

/** Who last changed the encumbrance, named as the audit log names them. */
async function lastChangedBy(tx: DbOrTx, ctx: ServiceContext, e: EncumbranceRecord) {
  const [row] = await tx
    .select({
      actorUserId: auditEvents.actorUserId,
      actorName: auditEvents.actorName,
      actorStanding: ACTOR_STANDING,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.targetType, 'parcel'),
        eq(auditEvents.targetId, e.parcelId),
        inArray(auditEvents.action, [...ENCUMBRANCE_VERSION_EVENTS]),
        sql`${auditEvents.metadata}->>'encumbranceId' = ${e.id}`,
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(1)
  return row ? actorFor(row).name : 'Someone'
}

function staleEncumbrance(name: string) {
  return conflict(
    'stale',
    `${name} changed this encumbrance a moment ago. Check the latest, then save again.`,
    { changedByName: name },
  )
}

/**
 * The clearing request waiting for this encumbrance. Callers run expireOnRead first (review #5),
 * so a request past its 7 days is expired, not pending, here and in the engine alike.
 */
async function pendingClearId(tx: DbOrTx, ctx: ServiceContext, id: string) {
  const [row] = await tx
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, ctx.organizationId),
        eq(approvalRequests.actionKey, 'land.encumbrance.clear'),
        eq(approvalRequests.subjectType, 'encumbrance'),
        eq(approvalRequests.subjectId, id),
        eq(approvalRequests.status, 'pending'),
      ),
    )
  return row?.id ?? null
}

/**
 * Edit details: only the fields sent; type, block choice and evidence never change. Refused
 * while a clearing request waits (owner, 28 Nov 2026), so approvers never approve something that
 * changed under them; and for a cleared one, which is frozen.
 */
export async function updateEncumbrance(
  ctx: ServiceContext,
  input: UpdateInput,
): Promise<ParcelDetail> {
  return ctx.db.transaction(async (tx) => {
    await expireOnRead(tx, ctx.organizationId)
    const { parcel, enc } = await lockBoth(tx, ctx, input.id)
    if (enc.status === 'cleared') throw clearedConflict(enc)
    if (await pendingClearId(tx, ctx, enc.id)) {
      throw conflict(
        'clearing_pending',
        `A request to clear this ${ENCUMBRANCE_WORDS[enc.type]} is waiting. Cancel it to change the details.`,
      )
    }
    if (enc.version !== input.expectedVersion) {
      throw staleEncumbrance(await lastChangedBy(tx, ctx, enc))
    }
    if (input.servedOn !== undefined) assertNotFuture(input.servedOn)
    const servedOn = input.servedOn ?? enc.servedOn
    if (input.nextOn !== undefined) {
      assertNextOn(input.nextOn, servedOn)
    } else if (enc.nextOn && input.servedOn !== undefined) {
      // A new served date must still leave the saved next date in range (lower bound only: the
      // ten years ahead were checked when it was saved).
      if (enc.nextOn < nextOnBounds(servedOn, servedOn).min) {
        throw badRequest('next_on_out_of_range', `${NEXT_ON_TOO_EARLY}.`)
      }
    }
    const changed = DETAIL_KEYS.filter(
      (k) => input[k] !== undefined && (input[k] ?? null) !== enc[k],
    )
    if (changed.length === 0) return parcelDetail(tx, ctx, parcel.id)
    // claimant and servedOn are never null here: zod makes them strings when sent.
    const next = Object.fromEntries(changed.map((k) => [k, input[k] ?? null])) as Partial<
      Pick<typeof encumbrances.$inferInsert, DetailKey>
    >
    await tx
      .update(encumbrances)
      .set({ ...next, version: enc.version + 1 })
      .where(and(eq(encumbrances.organizationId, ctx.organizationId), eq(encumbrances.id, enc.id)))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.encumbrance.updated',
      actor: actorOf(ctx),
      target: parcelTarget(parcel),
      before: Object.fromEntries(
        changed.map((k) => [k, auditWords(k, enc[k], next[k] ?? null).before]),
      ),
      after: Object.fromEntries(
        changed.map((k) => [k, auditWords(k, enc[k], next[k] ?? null).after]),
      ),
      metadata: encumbranceMetadata(parcel, enc),
    })
    await touchParcel(tx, ctx, parcel.id)
    return parcelDetail(tx, ctx, parcel.id)
  })
}

/**
 * The clearance document an earlier request for this encumbrance filed and the vault still
 * holds: sending again adds a version to it (owner, 28 Nov 2026) instead of a second document.
 */
async function earlierClearance(
  tx: DbOrTx,
  ctx: ServiceContext,
  parcelId: string,
  encumbranceId: string,
): Promise<string | null> {
  const result = await tx.execute<{ name: string }>(sql`
    select d.name from approval_requests r
    join title_documents d on d.organization_id = r.organization_id
      and d.id = (r.payload->>'clearanceDocumentId')::uuid
    where r.organization_id = ${ctx.organizationId} and r.action_key = 'land.encumbrance.clear'
      and r.subject_type = 'encumbrance' and r.subject_id = ${encumbranceId}
      and d.parcel_id = ${parcelId} and d.type = 'encumbrance_evidence'
    order by r.created_at desc limit 1`)
  return result.rows[0]?.name ?? null
}

export type RequestClearResult = {
  parcel: ParcelDetail
  notice: string
  pendingRequestId: string | null
  emails: EmailMessage[]
}

/**
 * Ask to clear: files the clearance evidence in the vault (attached now, so the 24-hour sweep
 * never takes it while the request waits), then asks the engine. Nothing unblocks until the last
 * approval. Any refusal (a request already waiting, nobody to approve, no rule) rolls the
 * document back with everything else.
 */
export async function requestClear(
  ctx: ServiceContext,
  input: ClearInput,
): Promise<RequestClearResult> {
  await assertPermission(ctx, 'create', 'upload title documents')
  assertNotFuture(input.clearedOn)
  await keepUpload(ctx, input.evidence.fileId, 'title_document')
  return ctx.db.transaction(async (tx) => {
    await expireOnRead(tx, ctx.organizationId)
    const { parcel, enc } = await lockBoth(tx, ctx, input.id)
    if (enc.status === 'cleared') throw clearedConflict(enc)
    // Before any file is filed: a waiting request's clearance takes no new version (security M1).
    const pending = await pendingClearId(tx, ctx, enc.id)
    if (pending) throw alreadyPending(pending)
    if (enc.version !== input.expectedVersion) {
      throw staleEncumbrance(await lastChangedBy(tx, ctx, enc))
    }
    if (input.clearedOn < enc.servedOn) {
      throw badRequest(
        'cleared_before_served',
        `Enter a date on or after ${dateWords(enc.servedOn)}.`,
      )
    }
    const earlier = await earlierClearance(tx, ctx, parcel.id, enc.id)
    const clearance = await addVersion(tx, ctx, parcel, {
      type: 'encumbrance_evidence',
      name: earlier ?? (await freeName(tx, ctx, parcel.id, `Clearance · ${suffixOf(enc)}`)),
      separate: earlier === null,
      fileId: input.evidence.fileId,
      file: 'kept',
      note: input.note,
    })
    const payload: EncumbranceClearPayload = {
      encumbranceId: enc.id,
      version: enc.version,
      parcelId: parcel.id,
      entityId: parcel.entityId,
      clearedOn: input.clearedOn,
      clearanceDocumentId: clearance.documentId,
      clearanceVersionId: clearance.versionId,
      note: input.note,
    }
    const out = await requestOrRun(tx, ctx, encumbranceClearPlugin, {
      payload,
      reason: input.reason ?? null,
    })
    await touchParcel(tx, ctx, parcel.id)
    const detail = await parcelDetail(tx, ctx, parcel.id)
    if (out.ran) {
      const { notice, emails } = out.result
      return { parcel: detail, notice, pendingRequestId: null, emails }
    }
    return {
      parcel: detail,
      notice: out.notice,
      pendingRequestId: out.requestId,
      emails: out.emails,
    }
  })
}
