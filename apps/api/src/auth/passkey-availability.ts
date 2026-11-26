import { type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { organizationAvailability, stageOf } from '@/platform/availability'
import type { FeatureStore } from '@/platform/feature-store'
import { activeSuperAdmin } from '@/platform/super-admins'

// `platform.passkeys` (decision 0016): adding needs it in the active organization; signing in
// needs it in any of the person's organizations, because sign-in comes before choosing one.

const FEATURE = 'platform.passkeys' as const

type PlanRow = {
  organization_id: string
  release_group: 'standard' | 'pilot' | 'internal' | null
  plan_version_id: string | null
}

async function planRows(db: DbOrTx, where: SQL): Promise<PlanRow[]> {
  const result = await db.execute<PlanRow>(sql`
    select m.organization_id, op.release_group, op.plan_version_id
    from members m
    left join organization_plans op on op.organization_id = m.organization_id
    where m.status = 'active' and ${where}
  `)
  return result.rows
}

async function anyHas(store: FeatureStore, rows: PlanRow[]): Promise<boolean> {
  if (rows.length === 0) return false
  const snapshot = await store.get()
  const now = new Date()
  return rows.some((r) =>
    organizationAvailability(
      snapshot,
      {
        organizationId: r.organization_id,
        releaseGroup: r.release_group ?? 'standard',
        planVersionId: r.plan_version_id,
      },
      now,
    ).has(FEATURE),
  )
}

/** Available to the session's active organization, where the person is an active member. */
export async function passkeysAvailableHere(
  db: DbOrTx,
  store: FeatureStore,
  session: { userId: string; activeOrganizationId: string | null },
): Promise<boolean> {
  if (!session.activeOrganizationId) return false
  const rows = await planRows(
    db,
    sql`m.user_id = ${session.userId} and m.organization_id = ${session.activeOrganizationId}::uuid`,
  )
  return anyHas(store, rows)
}

/**
 * Available in at least one of the person's active organizations (one query), or to an active
 * Vento super-admin unless passkeys are switched off for everyone (they may have no organization).
 */
export async function passkeysAvailableForUser(
  db: DbOrTx,
  store: FeatureStore,
  userId: string,
): Promise<boolean> {
  if (await anyHas(store, await planRows(db, sql`m.user_id = ${userId}`))) return true
  return !(await passkeysSwitchedOff(store)) && (await activeSuperAdmin(db, userId)) !== null
}

/** The kill switch: at `off`, passkey sign-in is refused before anyone is known. */
export async function passkeysSwitchedOff(store: FeatureStore): Promise<boolean> {
  return stageOf(await store.get(), FEATURE) === 'off'
}
