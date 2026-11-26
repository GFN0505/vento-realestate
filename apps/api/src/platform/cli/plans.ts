import { readFile } from 'node:fs/promises'
import {
  ADD_ONS,
  featureLabel,
  isFeatureKey,
  type PlanDefinition,
  planDefinition,
} from '@vento/shared'
import { asc, count, eq } from 'drizzle-orm'
import { organizationPlans, plans, planVersions } from '@/db/schema'
import { CommandError } from '../command-error'
import { findPlanVersion, LIMIT_WORDS, naira, resolveOrganization } from '../operations/common'
import { notifyTrials } from '../operations/notify-trials'
import {
  addAddOn,
  assignPlan,
  endTrial,
  parseLimitValue,
  previewAssign,
  publishPlan,
  removeAddOn,
  setFeatureOverride,
  setLimitOverride,
  startTrial,
} from '../operations/plans'
import { bootstrapStartingData } from '../seed-plans'
import {
  addOnArg,
  authorise,
  type CommandDeps,
  confirm,
  featureArg,
  limitArg,
  onOffClear,
  type Parsed,
} from './context'

export const PLANS_HELP = `Usage: pnpm plans <command>
  list | show <plan>
  publish <plan> --from <file.json> [--name … --sort n --default]
  assign <organization> <plan> [--version n]
  trial <organization> <plan> --days N   |   trial <organization> --end
  addon <organization> ai --budget 150000   |   addon <organization> ai --remove
  override <organization> feature <flag> <on|off|clear> [--until YYYY-MM-DD]
  override <organization> limit <projects|entities|members|ai_budget> <n|unlimited|clear> [--until …]
  notify-trials                          daily: trial emails and "trial ended" records
  bootstrap                              starting plans; internal organizations without a plan go on Enterprise
Changes need --reason "…" and --by <super-admin email>; --yes skips the question.`

function describeLimits(limits: Record<string, unknown>): string {
  return (
    Object.entries(LIMIT_WORDS)
      .map(([key, words]) => {
        const v = limits[key]
        return `${words} ${v === undefined ? 'unlimited' : String(v)}`
      })
      .join(' · ') || 'no limits'
  )
}

async function list(deps: CommandDeps): Promise<void> {
  const rows = await deps.db
    .select({
      key: plans.key,
      name: plans.name,
      version: planVersions.version,
      isDefault: plans.isDefaultForNew,
      archivedAt: plans.archivedAt,
      organizations: count(organizationPlans.id),
    })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .leftJoin(organizationPlans, eq(organizationPlans.planVersionId, planVersions.id))
    .groupBy(plans.id, planVersions.id)
    .orderBy(asc(plans.sortOrder), asc(planVersions.version))
  if (rows.length === 0) deps.io.print('No plans yet. Run plans bootstrap or plans publish.')
  for (const r of rows) {
    const tags = [r.isDefault ? 'default for new' : '', r.archivedAt ? 'archived' : '']
      .filter(Boolean)
      .join(', ')
    deps.io.print(
      `${r.name} (${r.key}) v${r.version}: ${r.organizations} organizations${tags ? ` · ${tags}` : ''}`,
    )
  }
}

async function show(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const latest = await findPlanVersion(deps.db, parsed.positionals[1] ?? '')
  const versions = await deps.db
    .select({
      version: planVersions.version,
      features: planVersions.features,
      limits: planVersions.limits,
      organizations: count(organizationPlans.id),
    })
    .from(planVersions)
    .leftJoin(organizationPlans, eq(organizationPlans.planVersionId, planVersions.id))
    .where(eq(planVersions.planId, latest.planId))
    .groupBy(planVersions.id)
    .orderBy(asc(planVersions.version))
  deps.io.print(`${latest.planName} (${latest.planKey}), sort ${latest.sortOrder}`)
  for (const v of versions) {
    deps.io.print(`v${v.version}: ${v.organizations} organizations`)
    deps.io.print(
      `  Features: ${v.features.map((k) => (isFeatureKey(k) ? featureLabel(k) : `${k} (unknown)`)).join(', ')}`,
    )
    deps.io.print(`  Limits: ${describeLimits((v.limits ?? {}) as Record<string, unknown>)}`)
  }
}

async function readDefinition(parsed: Parsed): Promise<PlanDefinition> {
  const key = parsed.positionals[1]
  if (!parsed.from) throw new CommandError('Add --from <file.json> with the plan definition.')
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(parsed.from, 'utf8'))
  } catch {
    throw new CommandError(`Couldn't read ${parsed.from} as JSON.`)
  }
  const merged = {
    ...(raw as Record<string, unknown>),
    ...(key && { key }),
    ...(parsed.name && { name: parsed.name }),
    ...(parsed.sort && { sortOrder: Number(parsed.sort) }),
    ...(parsed.default && { defaultForNew: true }),
  }
  const result = planDefinition.safeParse(merged)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.') || 'plan'}: ${i.message}`)
    throw new CommandError(`${parsed.from} isn't a valid plan:\n${problems.join('\n')}`)
  }
  return result.data
}

async function publish(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const definition = await readDefinition(parsed)
  const { actor, reason } = await authorise(deps, parsed)
  const lines = [
    `${definition.name}: ${definition.features.length} features (plus every core feature).`,
    `Limits: ${describeLimits(definition.limits)}`,
  ]
  if (!(await confirm(deps, parsed, lines))) return
  deps.io.print(await publishPlan(deps.db, actor, { definition, reason }))
}

async function assign(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const version = parsed.version === undefined ? undefined : Number(parsed.version)
  if (version !== undefined && !Number.isInteger(version))
    throw new CommandError('--version is a number.')
  const target = await findPlanVersion(deps.db, parsed.positionals[2] ?? '', version)
  const { actor, reason } = await authorise(deps, parsed)
  if (!(await confirm(deps, parsed, await previewAssign(deps.db, org, target, deps.now())))) return
  deps.io.print(await assignPlan(deps.db, actor, { organization: org, target, reason }, deps.now()))
}

async function trial(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  if (parsed.end) {
    const { actor, reason } = await authorise(deps, parsed)
    if (!(await confirm(deps, parsed, [`${org.name}'s trial will end now.`]))) return
    deps.io.print(await endTrial(deps.db, actor, { organization: org, reason }, deps.now()))
    return
  }
  const target = await findPlanVersion(deps.db, parsed.positionals[2] ?? '')
  const days = Number(parsed.days)
  if (!parsed.days || !Number.isInteger(days)) throw new CommandError('Add --days, e.g. --days 30.')
  const { actor, reason } = await authorise(deps, parsed)
  const lines = [`${org.name} gets a ${days}-day ${target.planName} trial.`]
  if (!(await confirm(deps, parsed, lines))) return
  deps.io.print(
    await startTrial(deps.db, actor, { organization: org, target, days, reason }, deps.now()),
  )
}

async function addon(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const addOn = addOnArg(parsed.positionals[2])
  const label = ADD_ONS[addOn].label
  if (parsed.remove) {
    const { actor, reason } = await authorise(deps, parsed)
    if (!(await confirm(deps, parsed, [`${label} will be removed from ${org.name}.`]))) return
    deps.io.print(
      await removeAddOn(deps.db, actor, { organization: org, addOn, reason }, deps.now()),
    )
    return
  }
  const budget = parsed.budget === undefined ? null : parseLimitValue('ai_budget', parsed.budget)
  if (!budget || budget === 'clear')
    throw new CommandError('Add --budget in naira a month, e.g. --budget 150000.')
  const { actor, reason } = await authorise(deps, parsed)
  if (!(await confirm(deps, parsed, [`${org.name} gets ${label} with ${naira(budget)} a month.`])))
    return
  deps.io.print(
    await addAddOn(deps.db, actor, { organization: org, addOn, budget, reason }, deps.now()),
  )
}

async function override(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const kind = parsed.positionals[2]
  if (kind === 'feature') {
    const key = featureArg(parsed.positionals[3])
    const value = onOffClear(parsed.positionals[4])
    const { actor, reason } = await authorise(deps, parsed)
    const line =
      value === 'clear'
        ? `${org.name}'s plan override for ${featureLabel(key)} will be cleared.`
        : `${featureLabel(key)} will be ${value} in ${org.name}'s plan${parsed.until ? ` until ${parsed.until}` : ''}.`
    if (!(await confirm(deps, parsed, [line]))) return
    deps.io.print(
      await setFeatureOverride(
        deps.db,
        actor,
        { organization: org, key, value, until: parsed.until, reason },
        deps.now(),
      ),
    )
    return
  }
  if (kind === 'limit') {
    const key = limitArg(parsed.positionals[3])
    const value = parseLimitValue(key, parsed.positionals[4] ?? '')
    const { actor, reason } = await authorise(deps, parsed)
    const line =
      value === 'clear'
        ? `${org.name}'s ${LIMIT_WORDS[key]} limit goes back to the plan's.`
        : `${org.name}'s ${LIMIT_WORDS[key]} limit will be ${parsed.positionals[4]}${parsed.until ? ` until ${parsed.until}` : ''}.`
    if (!(await confirm(deps, parsed, [line]))) return
    deps.io.print(
      await setLimitOverride(
        deps.db,
        actor,
        { organization: org, key, value, until: parsed.until, reason },
        deps.now(),
      ),
    )
    return
  }
  throw new CommandError(
    'Say override <organization> feature … or override <organization> limit ….',
  )
}

async function bootstrap(deps: CommandDeps): Promise<void> {
  const { published, assigned } = await bootstrapStartingData(deps.db)
  deps.io.print(
    published.length ? `Published: ${published.join(', ')}.` : 'Plans already published.',
  )
  deps.io.print(
    assigned.length
      ? `On Enterprise (internal): ${assigned.join(', ')}.`
      : 'No internal organization was without a plan.',
  )
}

export async function plansCommand(deps: CommandDeps, parsed: Parsed): Promise<void> {
  switch (parsed.positionals[0]) {
    case 'list':
      return list(deps)
    case 'show':
      return show(deps, parsed)
    case 'publish':
      return publish(deps, parsed)
    case 'assign':
      return assign(deps, parsed)
    case 'trial':
      return trial(deps, parsed)
    case 'addon':
      return addon(deps, parsed)
    case 'override':
      return override(deps, parsed)
    case 'notify-trials': {
      const { emailed, ended } = await notifyTrials(deps.db, deps.mailer, deps.now())
      deps.io.print(`Trial emails sent: ${emailed}. Trials recorded as ended: ${ended}.`)
      return
    }
    case 'bootstrap':
      return bootstrap(deps)
    default:
      deps.io.print(PLANS_HELP)
  }
}
