import { hasPermission } from '@vento/shared'
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { MemberContext, ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { auditEvents, entities, titleDocuments } from '@/db/schema'

// What of a parcel a viewer may see, in one place for the parcel page, its Activity and the
// audit log (Settings). The acquisition (cost, date) and "Bought from" go only to people who can
// edit Land & title or view Finance (spec question 5; seller: owner, 28 Nov 2026). Companies and
// document names are stored as ids in audit metadata and named when read, so a viewer outside a
// company never reads its name and the log keeps no family names. An encumbrance's claimant,
// lawyer, notes and files go only to people who can edit or approve in Land & title (owner, 28
// Nov 2026).

/** Acquisition cost and date, and the seller: people who can edit Land & title or view Finance. */
export function canSeeAcquisition(member: Pick<MemberContext, 'permissions'>): boolean {
  return (
    hasPermission(member.permissions, 'land', 'edit') ||
    hasPermission(member.permissions, 'finance', 'view')
  )
}

/** Audit before/after keys only `canSeeAcquisition` viewers receive. */
export const ACQUISITION_KEYS = ['acquisitionCost', 'acquiredOn', 'seller'] as const

/**
 * An encumbrance's claimant, lawyer, notes and its evidence and clearance files: people who can
 * edit Land & title or approve in it (Land & legal, owners, admins, Finance; owner, 28 Nov 2026).
 * Everyone else who views Land & title sees its type, reference, dates, status and the block.
 */
export function canSeeEncumbranceDetails(member: Pick<MemberContext, 'permissions'>): boolean {
  return (
    hasPermission(member.permissions, 'land', 'edit') ||
    hasPermission(member.permissions, 'land', 'approve')
  )
}

/**
 * Audit before/after keys only `canSeeEncumbranceDetails` viewers receive. The trail keeps only
 * markers for them ("(recorded)", "(changed)"; security M3), and even those say a claim has a
 * lawyer or notes.
 */
export const ENCUMBRANCE_DETAIL_KEYS = ['claimant', 'lawyer', 'notes', 'clearanceNote'] as const

const ENCUMBRANCE_KEYS_SQL = sql.raw(
  `array[${ENCUMBRANCE_DETAIL_KEYS.map((k) => `'${k}'`).join(', ')}]::text[]`,
)

/** How a company outside the viewer's access reads in a change. */
export const ANOTHER_COMPANY = 'Another company'

const KEYS_SQL = sql.raw(`array[${ACQUISITION_KEYS.map((k) => `'${k}'`).join(', ')}]::text[]`)

/**
 * Leaves out parcel edits that changed only what the viewer can't see (an empty "Changed the
 * parcel" still says the cost moved). In SQL, so pages and totals stay right.
 */
export function hiddenOnlyEdits(member: Pick<MemberContext, 'permissions'>): SQL | undefined {
  const parcelEdits = canSeeAcquisition(member)
    ? undefined
    : sql`not (${auditEvents.action} = 'land.parcel.updated'
    and ${auditEvents.metadata}->>'fromEntityId' is null
    and (coalesce(${auditEvents.before}, '{}'::jsonb) - ${KEYS_SQL}) = '{}'::jsonb
    and (coalesce(${auditEvents.after}, '{}'::jsonb) - ${KEYS_SQL}) = '{}'::jsonb
    and (coalesce(${auditEvents.before}, '{}'::jsonb) || coalesce(${auditEvents.after}, '{}'::jsonb)) ?| ${KEYS_SQL})`
  // An encumbrance edit of only its claimant, lawyer or notes says nothing to the others.
  const encumbranceEdits = canSeeEncumbranceDetails(member)
    ? undefined
    : sql`not (${auditEvents.action} = 'land.encumbrance.updated'
    and (coalesce(${auditEvents.before}, '{}'::jsonb) - ${ENCUMBRANCE_KEYS_SQL}) = '{}'::jsonb
    and (coalesce(${auditEvents.after}, '{}'::jsonb) - ${ENCUMBRANCE_KEYS_SQL}) = '{}'::jsonb)`
  return and(parcelEdits, encumbranceEdits)
}

type Json = Record<string, unknown> | null

const asJson = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export type LandEventRow = { action: string; before: unknown; after: unknown; metadata: unknown }

/** The ids land events point at, to name in two queries for a whole page. */
function idsOf(rows: readonly LandEventRow[]) {
  const entityIds = new Set<string>()
  const documentIds = new Set<string>()
  for (const r of rows) {
    if (!r.action.startsWith('land.')) continue
    const m = asJson(r.metadata)
    const entityId = str(m?.entityId)
    const fromEntityId = str(m?.fromEntityId)
    if (r.action === 'land.parcel.created' && entityId) entityIds.add(entityId)
    if (fromEntityId) {
      entityIds.add(fromEntityId)
      if (entityId) entityIds.add(entityId)
    }
    const documentId = str(m?.documentId)
    if (documentId) documentIds.add(documentId)
  }
  return { entityIds: [...entityIds], documentIds: [...documentIds] }
}

async function names(
  db: DbOrTx,
  organizationId: string,
  ids: { entityIds: string[]; documentIds: string[] },
  withDocuments: boolean,
) {
  const [companyRows, documentRows] = await runQueries(db, [
    async () =>
      ids.entityIds.length
        ? db
            .select({ id: entities.id, name: entities.name })
            .from(entities)
            .where(
              and(eq(entities.organizationId, organizationId), inArray(entities.id, ids.entityIds)),
            )
        : [],
    async () =>
      withDocuments && ids.documentIds.length
        ? db
            .select({ id: titleDocuments.id, name: titleDocuments.name })
            .from(titleDocuments)
            .where(
              and(
                eq(titleDocuments.organizationId, organizationId),
                inArray(titleDocuments.id, ids.documentIds),
              ),
            )
        : [],
  ])
  return {
    companies: new Map(companyRows.map((r) => [r.id, r.name])),
    documents: new Map(documentRows.map((r) => [r.id, r.name])),
  }
}

/**
 * Land events as this viewer may read them: hidden keys stripped, companies named (or "Another
 * company" outside their access), document names from the vault for people who can view Land &
 * title. Other modules' rows pass through untouched.
 */
export async function viewLandEvents<T extends LandEventRow>(
  db: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
  rows: readonly T[],
): Promise<T[]> {
  if (!rows.some((r) => r.action.startsWith('land.'))) return [...rows]
  const seesAcquisition = canSeeAcquisition(ctx.member)
  const seesEncumbrances = canSeeEncumbranceDetails(ctx.member)
  const seesDocuments = hasPermission(ctx.member.permissions, 'land', 'view')
  const found = await names(db, ctx.organizationId, idsOf(rows), seesDocuments)
  const limits = ctx.member.entityIds
  const company = (id: string | null): string | null => {
    if (!id) return null
    if (limits !== null && !limits.includes(id)) return ANOTHER_COMPANY
    return found.companies.get(id) ?? ANOTHER_COMPANY
  }
  return rows.map((r) => {
    if (!r.action.startsWith('land.')) return r
    const m = asJson(r.metadata)
    let before = asJson(r.before)
    let after = asJson(r.after)
    if (!seesAcquisition) {
      before = without(before, ACQUISITION_KEYS)
      after = without(after, ACQUISITION_KEYS)
    }
    if (!seesEncumbrances && r.action.startsWith('land.encumbrance.')) {
      before = without(before, ENCUMBRANCE_DETAIL_KEYS)
      after = without(after, ENCUMBRANCE_DETAIL_KEYS)
    }
    if (r.action === 'land.parcel.created') {
      after = { ...after, company: company(str(m?.entityId)) }
    } else if (str(m?.fromEntityId)) {
      before = { ...before, company: company(str(m?.fromEntityId)) }
      after = { ...after, company: company(str(m?.entityId)) }
    }
    const documentId = str(m?.documentId)
    const metadata = m && {
      ...without(m, ['documentName']),
      ...(seesDocuments && documentId && { documentName: found.documents.get(documentId) ?? null }),
    }
    return { ...r, before, after, metadata }
  })
}

function without(v: Json, keys: readonly string[]): Json {
  if (!v) return v
  return Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)))
}
