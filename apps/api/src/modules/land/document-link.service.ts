import {
  type DocumentVersion,
  documentLabel,
  type documentLinkInput,
  hasPermission,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import { parcels, titleDocuments } from '@/db/schema'
import { notFound, tooManyRequests } from '@/lib/errors'
import type { RateLimiter } from '@/lib/rate-limit'
import { recordAudit } from '@/modules/audit/audit.service'
import { type DownloadLink, signDownload } from '@/modules/files/files.records'
import { versionsOf } from './document-read'
import { loadVersion, versionMetadata } from './documents-write'
import { loadParcel, parcelScope, parcelTarget } from './land-access'

// Reading the vault: a document's versions, and the short-lived link to one (decision 0025).
// Both reach scope through the parcel, so another company's or organization's id is NOT_FOUND.

/** Newest first, removed ones included and flagged (they're in the history). */
export async function listVersions(
  ctx: ServiceContext,
  documentId: string,
): Promise<DocumentVersion[]> {
  const [doc] = await ctx.db
    .select({ id: titleDocuments.id })
    .from(titleDocuments)
    .innerJoin(
      parcels,
      and(
        eq(parcels.organizationId, titleDocuments.organizationId),
        eq(parcels.id, titleDocuments.parcelId),
      ),
    )
    .where(and(parcelScope(ctx), eq(titleDocuments.id, documentId)))
  if (!doc) throw notFound()
  return (await versionsOf(ctx.db, ctx.organizationId, [documentId])).get(documentId) ?? []
}

/** Links each person may issue per organization in LINK_WINDOW_MS (review: bulk downloading). */
export const LINKS_PER_WINDOW = 60
export const LINK_WINDOW_MS = 10 * 60_000

/**
 * The link limit: 60 per person per organization in 10 minutes, then TOO_MANY_REQUESTS with
 * when to retry. Checked before anything is read, so a refusal writes no audit event.
 */
export function assertLinkAllowed(
  limiter: RateLimiter,
  ctx: Pick<ServiceContext, 'organizationId' | 'user'>,
): void {
  const wait = limiter.hit(
    `landLink:${ctx.organizationId}:${ctx.user.id}`,
    LINKS_PER_WINDOW,
    LINK_WINDOW_MS,
  )
  if (wait > 0) {
    throw tooManyRequests(
      "You've opened a lot of documents in the last few minutes. Try again shortly.",
      wait,
    )
  }
}

/**
 * A 5-minute link to a version (preview or download), for anyone who can view the parcel, also
 * archived ones. A removed version's file is opened only by people who can remove documents
 * (Land & title delete); for others it's NOT_FOUND, though its facts stay in the history. Each
 * link issued is an audit event in the same transaction (decision 0025): who, which version,
 * how; never the link itself, nor the document's name.
 */
export async function documentLink(
  ctx: ServiceContext,
  input: z.output<typeof documentLinkInput>,
): Promise<DownloadLink> {
  return ctx.db.transaction(async (tx) => {
    const v = await loadVersion(tx, ctx, input.versionId)
    if (v.removedAt && !hasPermission(ctx.member.permissions, 'land', 'delete')) throw notFound()
    const parcel = await loadParcel(tx, ctx, v.parcelId)
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'land.document.link_issued',
      actor: actorOf(ctx),
      target: parcelTarget(parcel),
      metadata: { ...versionMetadata(parcel, v), disposition: input.disposition },
    })
    return signDownload({ ...ctx, db: tx }, v.fileId, {
      purpose: 'title_document',
      disposition: input.disposition,
      filename: `${parcel.name} · ${documentLabel(v.type, v.name)} v${v.versionNo}`,
    })
  })
}
