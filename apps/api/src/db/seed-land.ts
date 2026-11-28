import { type TitleStageType, toSqm } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { env } from '@/env'
import { raiseCounter } from '@/lib/counters'
import { lagosIsoDate } from '@/lib/format'
import { assertLocalOnly } from '@/lib/local-only'
import type { Storage } from '@/storage'
import type { DbOrTx } from './client'
import { parcels, titleStages } from './schema'
import { LAND_PARCELS, type ParcelSeed } from './seed-land-data'
import { seedLandEncumbrances } from './seed-land-encumbrances'
import { addSampleDocument } from './seed-land-files'
import { daysBefore, type HistoryItem, morningOf, writeHistory } from './seed-land-history'

// The golden-thread parcels (plan §9) with stages, sample documents in the bucket, a backdated
// history and (slice 2) their encumbrances, written through the real services. Dates are counted back from the run date, so the Land & legal queue always
// has its query, follow-up and stalled stage. Safe to run again: the seed's own parcels (their
// "added" event says seed) upsert by reference, stages by type, documents only when missing;
// history is written once, with the parcel. A reference someone took by hand is left alone.

export const START_STORAGE = 'Start local storage: pnpm db:up'

export type SeedCompanies = Record<ParcelSeed['company'], { id: string; name: string }>

export type LandSeedInput = {
  organizationId: string
  companies: SeedCompanies
  /** Ngozi Adeyemi, Land & legal: she registered the parcels and uploaded the files. */
  officer: { id: string; name: string; email: string }
  /**
   * Who approves clearing Plot 22's caveat under the default rule: Aisha Bello (Finance) at
   * step 1, Olumide Bankole (Owner) at step 2.
   */
  approvers: {
    finance: { id: string; name: string; email: string }
    owner: { id: string; name: string; email: string }
  }
  storage: Storage
  now?: Date
}

/** Refuses early, before any write, when the bucket can't be reached. */
export async function assertStorageUp(storage: Storage): Promise<void> {
  try {
    await storage.head('seed/probe')
  } catch {
    throw new Error(START_STORAGE)
  }
}

export async function seedLand(
  db: DbOrTx,
  input: LandSeedInput,
): Promise<{ reference: number; id: string; name: string }[]> {
  assertLocalOnly({ ...env, CI: process.env.CI })
  await assertStorageUp(input.storage)
  const today = lagosIsoDate(input.now ?? new Date())
  return db.transaction(async (tx) => {
    const out: { reference: number; id: string; name: string }[] = []
    for (const spec of LAND_PARCELS) {
      const seeded = await seedParcel(tx, input, spec, today)
      if (seeded) out.push({ reference: spec.reference, ...seeded })
    }
    // Numbers in between (P-0001…P-0020) belong to parcels the demo doesn't show.
    await raiseCounter(tx, input.organizationId, 'parcel', 21)
    await seedLandEncumbrances(tx, input, out, today)
    return out
  })
}

async function seedParcel(tx: DbOrTx, input: LandSeedInput, spec: ParcelSeed, today: string) {
  const company = input.companies[spec.company]
  const facts = {
    entityId: company.id,
    name: spec.name,
    state: spec.state,
    lga: spec.lga,
    area: spec.area,
    sizeSqm: toSqm({ value: spec.sizeHa, unit: 'ha' }),
    sizeUnit: 'ha' as const,
    sizeEntered: spec.sizeHa,
    plotSizeSqm: null,
    status: spec.status,
    acquiredOn: spec.acquiredOn ?? null,
    acquisitionCost: spec.cost ?? null,
    seller: spec.seller ?? null,
  }
  const existing = await parcelAt(tx, input.organizationId, spec.reference)
  if (existing && !existing.seeded) return null
  const [row] = existing
    ? await tx
        .update(parcels)
        .set(facts)
        .where(and(eq(parcels.organizationId, input.organizationId), eq(parcels.id, existing.id)))
        .returning({ id: parcels.id })
    : await tx
        .insert(parcels)
        .values({ organizationId: input.organizationId, referenceNumber: spec.reference, ...facts })
        .returning({ id: parcels.id })
  if (!row) throw new Error(`Seed parcel ${spec.name} did not save`)
  const parcel = { id: row.id, name: spec.name, entityId: company.id }
  const stageIds = await upsertStages(tx, input, parcel.id, spec, today)
  const created = daysBefore(today, spec.addedDaysAgo)
  const history: HistoryItem[] = []
  for (const doc of spec.documents) {
    const added = await addSampleDocument(tx, input, parcel, doc)
    if (added) history.push({ at: morningOf(created, 11), doc, ...added })
  }
  if (!existing) {
    await writeHistory(tx, input, parcel, spec, { created, today, stageIds, history })
  }
  return { id: parcel.id, name: spec.name }
}

/** The parcel holding this reference, and whether the seed made it (its added event says so). */
async function parcelAt(tx: DbOrTx, organizationId: string, reference: number) {
  const [row] = await tx
    .select({
      id: parcels.id,
      // Nested in sql``, the columns stay table-qualified in this single-table select.
      seeded: sql<boolean>`exists (select 1 from audit_events a
        where a.organization_id = ${sql`${parcels.organizationId}`} and a.target_type = 'parcel'
          and a.target_id = ${sql`${parcels.id}`} and a.action = 'land.parcel.created'
          and a.metadata->>'seed' = 'true')`,
    })
    .from(parcels)
    .where(and(eq(parcels.organizationId, organizationId), eq(parcels.referenceNumber, reference)))
  return row ?? null
}

async function upsertStages(
  tx: DbOrTx,
  input: LandSeedInput,
  parcelId: string,
  spec: ParcelSeed,
  today: string,
): Promise<Map<TitleStageType, string>> {
  const ids = new Map<TitleStageType, string>()
  for (const s of spec.stages) {
    const on =
      s.daysAgo === undefined ? daysBefore(today, spec.addedDaysAgo) : daysBefore(today, s.daysAgo)
    const fields = {
      status: s.status,
      statusOn: s.daysAgo === undefined ? null : daysBefore(today, s.daysAgo),
      note: s.note ?? null,
      followUpOn: s.followUpDaysAgo === undefined ? null : daysBefore(today, s.followUpDaysAgo),
      reference: s.reference ?? null,
      issuedBy: s.issuedBy ?? null,
      // One update made it what it is; Undo is long past.
      version: s.status === 'not_started' ? 1 : 2,
      updatedByUserId: input.officer.id,
      // Backdated, so a fresh seed never offers Undo (it's for the last 2 minutes).
      updatedAt: morningOf(on, 12),
    }
    const [row] = await tx
      .insert(titleStages)
      .values({ organizationId: input.organizationId, parcelId, type: s.type, ...fields })
      .onConflictDoUpdate({ target: [titleStages.parcelId, titleStages.type], set: fields })
      .returning({ id: titleStages.id })
    if (row) ids.set(s.type, row.id)
  }
  return ids
}
