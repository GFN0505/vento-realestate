import {
  FEATURE_KEYS,
  type FeatureKey,
  featureLabel,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'
import type { PreviewLine } from '@vento/shared/console'
import type { DbOrTx } from '@/db/client'
import {
  type OrganizationAvailability,
  type OrganizationPlanRef,
  type OrganizationRows,
  organizationAvailability,
  type Snapshot,
} from '../availability'
import { FEATURE_RECORD_COUNTERS } from '../usage'

// "Gained, lost, out of view" for every preview (admin-console plan §6.2): evaluate availability
// before and after a change in memory, the way previewStage always has, and diff the two.

/** What a change does to one organization's inputs. Omitted parts stay as they are. */
export type SimulatedChange = {
  stages?: ReadonlyMap<FeatureKey, ReleaseStage>
  releaseGroup?: ReleaseGroup
  planVersionId?: string | null
  rows?: (rows: OrganizationRows) => OrganizationRows
}

export type Simulation = { before: OrganizationAvailability; after: OrganizationAvailability }

const NO_ROWS: OrganizationRows = { overrides: [], addOns: [], trials: [] }

export function simulate(
  snapshot: Snapshot,
  org: OrganizationPlanRef,
  change: SimulatedChange,
  now: Date,
): Simulation {
  const before = organizationAvailability(snapshot, org, now)
  const organizations = new Map(snapshot.organizations)
  if (change.rows) {
    organizations.set(
      org.organizationId,
      change.rows(snapshot.organizations.get(org.organizationId) ?? NO_ROWS),
    )
  }
  const after = organizationAvailability(
    { ...snapshot, stages: change.stages ?? snapshot.stages, organizations },
    {
      organizationId: org.organizationId,
      releaseGroup: change.releaseGroup ?? org.releaseGroup,
      planVersionId: change.planVersionId === undefined ? org.planVersionId : change.planVersionId,
    },
    now,
  )
  return { before, after }
}

export function gainedAndLost(sim: Simulation): { gained: FeatureKey[]; lost: FeatureKey[] } {
  return {
    gained: FEATURE_KEYS.filter((k) => !sim.before.has(k) && sim.after.has(k)),
    lost: FEATURE_KEYS.filter((k) => sim.before.has(k) && !sim.after.has(k)),
  }
}

const NAMES_SHOWN = 8

/** "Sales, Finance and Payroll", or "Sales, …, Payroll and 12 more" for a long list. */
export function featureList(keys: readonly FeatureKey[]): string {
  const names = keys.map(featureLabel)
  if (names.length > NAMES_SHOWN) {
    return `${names.slice(0, NAMES_SHOWN).join(', ')} and ${names.length - NAMES_SHOWN} more`
  }
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Records in features that stop being available: the members stop seeing them (danger). */
export async function outOfViewLines(
  db: DbOrTx,
  org: { id: string; name: string },
  lost: readonly FeatureKey[],
): Promise<PreviewLine[]> {
  const lines: PreviewLine[] = []
  for (const key of lost) {
    const counter = FEATURE_RECORD_COUNTERS[key]
    const n = counter ? await counter(db, org.id) : 0
    if (n > 0) {
      lines.push({
        text: `${org.name} has ${n} records in ${featureLabel(key)}. Its members will stop seeing them.`,
        tone: 'danger',
      })
    }
  }
  return lines
}

/** Gained (info), lost (warning) and out of view (danger), in that order. */
export async function impactLines(
  db: DbOrTx,
  org: { id: string; name: string },
  sim: Simulation,
): Promise<PreviewLine[]> {
  const { gained, lost } = gainedAndLost(sim)
  const lines: PreviewLine[] = []
  if (gained.length) lines.push({ text: `Gains ${featureList(gained)}.`, tone: 'info' })
  if (lost.length) lines.push({ text: `Loses ${featureList(lost)}.`, tone: 'warning' })
  return [...lines, ...(await outOfViewLines(db, org, lost))]
}
