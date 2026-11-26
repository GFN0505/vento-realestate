import { FEATURE_KEYS, featureLabel, isFeatureKey, prerequisitesOf } from '@vento/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  featureReleases,
  organizationOverrides,
  organizations,
  planVersions,
  platformAuditEvents,
} from '@/db/schema'
import { formatDate } from '@/lib/format'
import { isLive, stageOf } from '../availability'
import { CommandError } from '../command-error'
import { resolveOrganization } from '../operations/common'
import {
  allOrganizationPlans,
  holders,
  missingPrerequisites,
  previewStage,
  setReleaseGroup,
  setReleaseOverride,
  setStage,
} from '../operations/release'
import { loadOrganizationPlan, loadSnapshot } from '../snapshot'
import {
  authorise,
  type CommandDeps,
  confirm,
  featureArg,
  groupArg,
  onOffClear,
  type Parsed,
  stageArg,
} from './context'

export const FLAGS_HELP = `Usage: pnpm flags <command>
  list                                   every flag: stage, who has it, plans
  show <flag>                            stage, prerequisites, plans, organizations, overrides, history
  stage <flag> <off|internal|pilot|on>   release stage for everyone
  group <organization> <standard|pilot|internal>
  override <organization> <flag> <on|off|clear> [--until YYYY-MM-DD]
Changes need --reason "…" and --by <super-admin email>; --yes skips the question.`

async function unknownKeysInData(deps: CommandDeps): Promise<string[]> {
  const [stages, versions] = await Promise.all([
    deps.db.select({ key: featureReleases.featureKey }).from(featureReleases),
    deps.db.select({ features: planVersions.features }).from(planVersions),
  ])
  const keys = new Set([...stages.map((s) => s.key), ...versions.flatMap((v) => v.features)])
  return [...keys].filter((k) => !isFeatureKey(k)).sort()
}

async function list(deps: CommandDeps): Promise<void> {
  const now = deps.now()
  const [snapshot, orgs] = await Promise.all([
    loadSnapshot(deps.db, { now }),
    allOrganizationPlans(deps.db),
  ])
  deps.io.print('Flag                              Stage     Orgs  Plans')
  for (const key of FEATURE_KEYS) {
    const plans = snapshot.latestPlans.filter((p) => p.features.has(key)).map((p) => p.planName)
    deps.io.print(
      `${key.padEnd(34)}${stageOf(snapshot, key).padEnd(10)}${String(holders(snapshot, orgs, key, now).length).padStart(4)}  ${plans.join(', ') || '–'}`,
    )
  }
  const stale = await unknownKeysInData(deps)
  if (stale.length)
    deps.io.print(`Keys in data the code no longer has (ignored): ${stale.join(', ')}`)
}

async function show(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const key = featureArg(parsed.positionals[1])
  const now = deps.now()
  const [snapshot, orgs] = await Promise.all([
    loadSnapshot(deps.db, { now }),
    allOrganizationPlans(deps.db),
  ])
  const having = holders(snapshot, orgs, key, now)
  const io = deps.io
  io.print(`${featureLabel(key)} (${key})`)
  io.print(`Stage: ${stageOf(snapshot, key)}`)
  io.print(`Needs: ${prerequisitesOf(key).join(', ') || 'nothing'}`)
  io.print(
    `Plans: ${
      snapshot.latestPlans
        .filter((p) => p.features.has(key))
        .map((p) => p.planName)
        .join(', ') || 'none'
    }`,
  )
  for (const group of ['internal', 'pilot', 'standard'] as const) {
    const names = having.filter((o) => o.releaseGroup === group).map((o) => o.name)
    io.print(`Available to ${group}: ${names.length ? names.join(', ') : 'none'}`)
  }
  const overrides = await deps.db
    .select({
      name: organizations.name,
      kind: organizationOverrides.kind,
      enabled: organizationOverrides.enabled,
      expiresAt: organizationOverrides.expiresAt,
    })
    .from(organizationOverrides)
    .innerJoin(organizations, eq(organizations.id, organizationOverrides.organizationId))
    .where(and(eq(organizationOverrides.key, key), isNull(organizationOverrides.clearedAt)))
  const live = overrides.filter((o) => isLive(o, now))
  io.print(live.length ? 'Overrides:' : 'Overrides: none')
  for (const o of live) {
    const until = o.expiresAt ? ` until ${formatDate(o.expiresAt)}` : ''
    io.print(`  ${o.name}: ${o.kind} ${o.enabled ? 'on' : 'off'}${until}`)
  }
  const history = await deps.db
    .select({
      at: platformAuditEvents.createdAt,
      who: platformAuditEvents.actorName,
      action: platformAuditEvents.action,
      reason: platformAuditEvents.reason,
    })
    .from(platformAuditEvents)
    .where(eq(platformAuditEvents.targetKey, key))
    .orderBy(desc(platformAuditEvents.createdAt))
    .limit(5)
  if (history.length) io.print('Recent changes:')
  for (const h of history) io.print(`  ${formatDate(h.at)}  ${h.who}  ${h.action}  "${h.reason}"`)
}

async function stage(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const key = featureArg(parsed.positionals[1])
  const to = stageArg(parsed.positionals[2])
  const { actor, reason } = await authorise(deps, parsed)
  const preview = await previewStage(deps.db, key, to, deps.now())
  if (preview.current === to) throw new CommandError(`${featureLabel(key)} is already at ${to}.`)
  if (!(await confirm(deps, parsed, preview.lines))) return
  deps.io.print(await setStage(deps.db, actor, { key, stage: to, reason }))
}

async function group(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const to = groupArg(parsed.positionals[2])
  const { actor, reason } = await authorise(deps, parsed)
  const { releaseGroup } = await loadOrganizationPlan(deps.db, org.id)
  if (!(await confirm(deps, parsed, [`${org.name} moves from ${releaseGroup} to ${to}.`]))) return
  deps.io.print(await setReleaseGroup(deps.db, actor, { organization: org, group: to, reason }))
}

async function override(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const key = featureArg(parsed.positionals[2])
  const value = onOffClear(parsed.positionals[3])
  const { actor, reason } = await authorise(deps, parsed)
  const lines = [
    value === 'clear'
      ? `${org.name}'s release override for ${featureLabel(key)} will be cleared.`
      : `${featureLabel(key)} will be released ${value} for ${org.name}${parsed.until ? ` until ${parsed.until}` : ''}.`,
  ]
  if (value === 'on') {
    const missing = await missingPrerequisites(deps.db, org, key, deps.now())
    if (missing) lines.push(missing)
  }
  if (!(await confirm(deps, parsed, lines))) return
  deps.io.print(
    await setReleaseOverride(
      deps.db,
      actor,
      { organization: org, key, value, until: parsed.until, reason },
      deps.now(),
    ),
  )
}

export async function flagsCommand(deps: CommandDeps, parsed: Parsed): Promise<void> {
  switch (parsed.positionals[0]) {
    case 'list':
      return list(deps)
    case 'show':
      return show(deps, parsed)
    case 'stage':
      return stage(deps, parsed)
    case 'group':
      return group(deps, parsed)
    case 'override':
      return override(deps, parsed)
    default:
      deps.io.print(FLAGS_HELP)
  }
}
