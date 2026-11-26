import { readFile } from 'node:fs/promises'
import { featureLabel, isFeatureKey, type PlanDefinition, planDefinition } from '@vento/shared'
import { asc, count, eq } from 'drizzle-orm'
import { organizationPlans, plans, planVersions } from '@/db/schema'
import { LIMIT_WORDS } from '../limit-words'
import { findPlanVersion, resolveOrganization } from '../operations/common'
import { notifyTrials } from '../operations/notify-trials'
import {
  addAddOn,
  assignPlan,
  endTrial,
  parseLimitValue,
  previewAddOn,
  previewAssign,
  previewFeatureOverride,
  previewLimitOverride,
  previewPublish,
  previewRemoveAddOn,
  previewTrialEnd,
  previewTrialStart,
  publishPlan,
  removeAddOn,
  setFeatureOverride,
  setLimitOverride,
  startTrial,
} from '../operations/plans'
import { type PlatformActor, SCHEDULED_ACTOR } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { bootstrapStartingData, previewStartingData, SETUP_ACTOR } from '../seed-plans'
import { activeSuperAdminCount, requireSuperAdmin } from '../super-admins'
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
  notify-trials                          daily from cron (VENTO_CRON=1); by hand needs --by
  bootstrap                              starting plans; internal organizations without a plan go on Enterprise
                                         (needs --break-glass, --by and --reason once any super-admin exists)
Make changes in the Vento console. If it's down, changes need --break-glass, --reason "…" and
--by <super-admin email> (the other super-admins are emailed); --yes skips the question.`

function describeLimits(limits: Record<string, unknown>): string {
  return (
    Object.entries(LIMIT_WORDS)
      .map(([key, { many: words }]) => {
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
  if (!parsed.from) throw new PlatformError('Add --from <file.json> with the plan definition.')
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(parsed.from, 'utf8'))
  } catch {
    throw new PlatformError(`Couldn't read ${parsed.from} as JSON.`)
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
    throw new PlatformError(`${parsed.from} isn't a valid plan:\n${problems.join('\n')}`)
  }
  return result.data
}

async function publish(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const definition = await readDefinition(parsed)
  const { actor, reason } = await authorise(deps, parsed, 'plans publish')
  const preview = await previewPublish(deps.db, definition)
  const lines = [...preview.lines, `Limits: ${describeLimits(definition.limits)}`]
  if (!(await confirm(deps, parsed, lines))) return
  deps.io.print(await publishPlan(deps.db, actor, { definition, reason }))
}

async function assign(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const version = parsed.version === undefined ? undefined : Number(parsed.version)
  if (version !== undefined && !Number.isInteger(version))
    throw new PlatformError('--version is a number.')
  const target = await findPlanVersion(deps.db, parsed.positionals[2] ?? '', version)
  const { actor, reason } = await authorise(deps, parsed, 'plans assign')
  const preview = await previewAssign(deps.db, org, target, deps.now())
  if (!(await confirm(deps, parsed, preview.lines))) return
  deps.io.print(await assignPlan(deps.db, actor, { organization: org, target, reason }, deps.now()))
}

async function trial(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  if (parsed.end) {
    const { actor, reason } = await authorise(deps, parsed, 'plans trial --end')
    const preview = await previewTrialEnd(deps.db, org, deps.now())
    if (!(await confirm(deps, parsed, preview.lines))) return
    deps.io.print(await endTrial(deps.db, actor, { organization: org, reason }, deps.now()))
    return
  }
  const target = await findPlanVersion(deps.db, parsed.positionals[2] ?? '')
  const days = Number(parsed.days)
  if (!parsed.days || !Number.isInteger(days))
    throw new PlatformError('Add --days, e.g. --days 30.')
  const { actor, reason } = await authorise(deps, parsed, 'plans trial')
  const preview = await previewTrialStart(deps.db, org, target, days, deps.now())
  if (!(await confirm(deps, parsed, preview.lines))) return
  deps.io.print(
    await startTrial(deps.db, actor, { organization: org, target, days, reason }, deps.now()),
  )
}

async function addon(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const org = await resolveOrganization(deps.db, parsed.positionals[1] ?? '')
  const addOn = addOnArg(parsed.positionals[2])
  if (parsed.remove) {
    const { actor, reason } = await authorise(deps, parsed, 'plans addon --remove')
    const preview = await previewRemoveAddOn(deps.db, org, addOn, deps.now())
    if (!(await confirm(deps, parsed, preview.lines))) return
    deps.io.print(
      await removeAddOn(deps.db, actor, { organization: org, addOn, reason }, deps.now()),
    )
    return
  }
  const budget = parsed.budget === undefined ? null : parseLimitValue('ai_budget', parsed.budget)
  if (!budget || budget === 'clear')
    throw new PlatformError('Add --budget in naira a month, e.g. --budget 150000.')
  const { actor, reason } = await authorise(deps, parsed, 'plans addon')
  const preview = await previewAddOn(deps.db, org, addOn, budget, deps.now())
  if (!(await confirm(deps, parsed, preview.lines))) return
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
    const { actor, reason } = await authorise(
      deps,
      parsed,
      value === 'clear' ? 'plans override clear' : 'plans override feature',
    )
    const preview = await previewFeatureOverride(deps.db, org, key, value, parsed.until, deps.now())
    if (!(await confirm(deps, parsed, preview.lines))) return
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
    const { actor, reason } = await authorise(
      deps,
      parsed,
      value === 'clear' ? 'plans override clear' : 'plans override limit',
    )
    const preview = await previewLimitOverride(deps.db, org, key, value, parsed.until, deps.now())
    if (!(await confirm(deps, parsed, preview.lines))) return
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
  throw new PlatformError(
    'Say override <organization> feature … or override <organization> limit ….',
  )
}

/**
 * Starting data on an environment. On a fresh one (no super-admin yet) it runs as "Vento
 * (setup)"; once any super-admin exists it needs --by and --reason like every other change.
 */
async function bootstrap(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const actor: PlatformActor =
    (await activeSuperAdminCount(deps.db)) > 0
      ? (await authorise(deps, parsed, 'plans bootstrap')).actor
      : { ...SETUP_ACTOR, operator: deps.operator }
  if (!(await confirm(deps, parsed, await previewStartingData(deps.db)))) return
  const { published, assigned } = await bootstrapStartingData(deps.db, actor)
  deps.io.print(
    published.length ? `Published: ${published.join(', ')}.` : 'Plans already published.',
  )
  deps.io.print(
    assigned.length
      ? `On Enterprise (internal): ${assigned.join(', ')}.`
      : 'No internal organization was without a plan.',
  )
}

/** Daily from the scheduler (VENTO_CRON=1); by hand it needs a super-admin's --by. */
async function runNotifyTrials(deps: CommandDeps, parsed: Parsed): Promise<void> {
  const actor = deps.scheduled
    ? { ...SCHEDULED_ACTOR, operator: deps.operator }
    : await requireSuperAdmin(deps.db, parsed.by, deps.operator)
  const { emailed, ended } = await notifyTrials(deps.db, deps.mailer, deps.now(), actor)
  deps.io.print(`Trial emails sent: ${emailed}. Trials recorded as ended: ${ended}.`)
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
    case 'notify-trials':
      return runNotifyTrials(deps, parsed)
    case 'bootstrap':
      return bootstrap(deps, parsed)
    default:
      deps.io.print(PLANS_HELP)
  }
}
