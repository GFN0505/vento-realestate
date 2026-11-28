import { auditFieldChanges, auditWhat, type TimelineEvent } from '@vento/shared'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import { runQueries } from '@/db/run-queries'
import { auditEvents } from '@/db/schema'
import { pageOffset, toPage } from '@/lib/paginate'
import { ACTOR_STANDING, actorFor } from '@/modules/audit/audit-read.service'
import { loadParcel } from './land-access'
import { hiddenOnlyEdits, viewLandEvents } from './land-visibility'

// A parcel's Activity (the first record timeline): its audit events, newest first, in plain
// words. One query on audit_events_org_target_idx. Device and IP are never returned; links issued
// are access records, not changes, so they stay in the audit log only.

type Json = Record<string, unknown> | null

const asJson = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/**
 * Hidden fields (cost, date, seller) are stripped and edits of only those left out
 * (land-visibility.ts); companies and document names are read now, from the ids kept.
 */
export async function parcelActivity(
  ctx: ServiceContext,
  input: { id: string; page: number; pageSize: number },
): Promise<{ items: TimelineEvent[]; page: number; pageSize: number; total: number }> {
  const parcel = await loadParcel(ctx.db, ctx, input.id)
  const where = and(
    eq(auditEvents.organizationId, ctx.organizationId),
    eq(auditEvents.targetType, 'parcel'),
    eq(auditEvents.targetId, parcel.id),
    ne(auditEvents.action, 'land.document.link_issued'),
    hiddenOnlyEdits(ctx.member),
  )
  const { limit, offset } = pageOffset(input)
  const [rows, [count]] = await runQueries(ctx.db, [
    () =>
      ctx.db
        .select({
          id: auditEvents.id,
          at: auditEvents.createdAt,
          actorUserId: auditEvents.actorUserId,
          actorName: auditEvents.actorName,
          actorStanding: ACTOR_STANDING,
          action: auditEvents.action,
          before: auditEvents.before,
          after: auditEvents.after,
          metadata: auditEvents.metadata,
        })
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(limit)
        .offset(offset),
    () => ctx.db.select({ n: sql<number>`count(*)::int` }).from(auditEvents).where(where),
  ])
  const visible = await viewLandEvents(ctx.db, ctx, rows)
  const items = visible.map((r): TimelineEvent => {
    const before = asJson(r.before)
    const after = asJson(r.after)
    return {
      id: r.id,
      at: r.at.toISOString(),
      actor: actorFor(r),
      action: r.action,
      // Without the parcel's name: the page is the parcel.
      what: auditWhat(r.action, { targetLabel: null, metadata: asJson(r.metadata) }),
      changes: auditFieldChanges(before, after),
    }
  })
  return toPage(items, input, count?.n ?? 0)
}
