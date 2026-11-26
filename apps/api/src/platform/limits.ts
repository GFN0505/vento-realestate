import { type CountLimitKey, Decimal } from '@vento/shared'
import type { ServiceContext } from '@/access/context'
import { firstOwner } from '@/access/who-can-grant'
import type { DbOrTx } from '@/db/client'
import { planLimit } from '@/lib/errors'
import { isLive, organizationAvailability, type PlanVersionInfo } from './availability'
import { ensureOrganizationPlanRow, loadOrganizationPlan, loadSnapshot } from './snapshot'
import { LIMIT_USAGE } from './usage'

const WORDS: Record<CountLimitKey, { one: string; many: string; action: string }> = {
  projects: { one: 'active project', many: 'active projects', action: 'Archive a project' },
  entities: { one: 'active entity', many: 'active entities', action: 'Archive an entity' },
  members: { one: 'person', many: 'people', action: 'Remove someone' },
}

const amount = (key: CountLimitKey, n: number) =>
  `${n} ${n === 1 ? WORDS[key].one : WORDS[key].many}`

export type LimitMessageInput = {
  key: CountLimitKey
  included: number
  used: number
  isOwner: boolean
  /** The plan's name, unless an override set the value ("Your plan includes …"). */
  planName: string | null
  /** The next plan up that includes more, if any. */
  higherPlanName: string | null
  ownerName: string | null
}

/** The plan-limit sentence for the caller's role (spec UI copy). Never names a price. */
export function planLimitMessage(input: LimitMessageInput): string {
  const { key, included } = input
  if (!input.isOwner) {
    const ask = input.ownerName ? ` Ask ${input.ownerName} (owner).` : ''
    return `Your organization has reached its limit of ${amount(key, included)}.${ask}`
  }
  const talk = input.higherPlanName
    ? `talk to Vento about ${input.higherPlanName}`
    : 'talk to Vento'
  if (key === 'members') {
    const are = input.used === 1 ? 'is' : 'are'
    return `Your plan includes ${amount(key, included)}, and ${input.used} ${are} in or invited. ${WORDS[key].action} or ${talk}.`
  }
  const plan = input.planName ? `Your ${input.planName} plan` : 'Your plan'
  return `${plan} includes ${amount(key, included)}. ${WORDS[key].action} or ${talk}.`
}

/** The lowest plan above the current one whose limit is higher (or unlimited). */
export function higherPlanFor(
  latestPlans: readonly PlanVersionInfo[],
  current: PlanVersionInfo | null,
  key: CountLimitKey,
  included: number,
): PlanVersionInfo | null {
  return (
    latestPlans.find((p) => {
      if (current && p.sortOrder <= current.sortOrder) return false
      const limit = p.limits[key]
      return limit === undefined || new Decimal(limit).gt(included)
    }) ?? null
  )
}

/**
 * Refuses a create that would take the organization over a plan limit. Call it inside the
 * create's transaction: it locks the organization's plan row, so two creates at once queue
 * and the second counts again after the first commits. Unlimited returns before any count.
 */
export async function assertWithinLimit(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member' | 'user'>,
  key: CountLimitKey,
  adding: number,
): Promise<void> {
  const counter = LIMIT_USAGE[key]
  if (!counter) return
  await ensureOrganizationPlanRow(tx, ctx.organizationId)
  const plan = await loadOrganizationPlan(tx, ctx.organizationId, { lock: true })
  if (plan.releaseGroup === 'internal') return
  // Fresh, not the request's snapshot: a deal or add-on recorded seconds ago must count.
  const now = new Date()
  const snapshot = await loadSnapshot(tx, { organizationId: ctx.organizationId, now })
  const availability = organizationAvailability(
    snapshot,
    { organizationId: ctx.organizationId, ...plan },
    now,
  )
  const included = availability.countLimit(key)
  if (included === null) return
  const used = await counter(tx, ctx.organizationId)
  if (used + adding <= included) return

  const isOwner = ctx.member.roleKey === 'owner'
  const overridden = (snapshot.organizations.get(ctx.organizationId)?.overrides ?? []).some(
    (o) => o.kind === 'limit' && o.key === key && isLive(o, now),
  )
  const owner = isOwner ? null : await firstOwner(tx, ctx.organizationId, ctx.user.id)
  const message = planLimitMessage({
    key,
    included,
    used,
    isOwner,
    planName: overridden ? null : (availability.plan?.planName ?? null),
    higherPlanName:
      higherPlanFor(snapshot.latestPlans, availability.plan, key, included)?.planName ?? null,
    ownerName: owner?.name ?? null,
  })
  throw planLimit(message, {
    limit: key,
    included,
    ...(owner && { askName: owner.name, askRole: 'owner' }),
  })
}
