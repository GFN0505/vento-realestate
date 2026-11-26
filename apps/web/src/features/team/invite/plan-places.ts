import type { MePlan } from '@vento/shared'

/*
 * Owners on a plan with a people limit see it before sending (spec "Plan places"). Everyone else
 * learns of a limit only from the server's refusal. `used` counts members plus open invitations.
 */

export type PeopleLimit = { included: number; used: number; planName: string | null }

/** The members limit from `me.plan` (owners only); null when unlimited or not the owner's view. */
export function peopleLimit(plan: MePlan | null): PeopleLimit | null {
  const limit = plan?.limits.find((l) => l.key === 'members')
  if (!plan || !limit || limit.included === null) return null
  return { included: limit.included, used: limit.used, planName: plan.name }
}

export function placesLeft(limit: PeopleLimit): number {
  return Math.max(0, limit.included - limit.used)
}

const places = (n: number) => (n === 1 ? '1 place' : `${n} places`)
const onPlan = (limit: PeopleLimit) => (limit.planName ? ` on your ${limit.planName} plan` : '')

/**
 * The reason above a disabled Send when the rows don't fit (owners), leading with the way out;
 * null when they fit. Which rows are over is marked on the rows.
 */
export function planPlacesMessage(limit: PeopleLimit | null, rows: number): string | null {
  if (!limit) return null
  const left = placesLeft(limit)
  if (rows <= left) return null
  if (left === 0) {
    return `All ${limit.included} places${onPlan(limit)} are taken. Talk to Vento for more.`
  }
  return `You have ${places(left)} left${onPlan(limit)}. Talk to Vento for more.`
}

/** "8 of 10 people on your Starter plan" for the Team context line. */
export function usageLine(limit: PeopleLimit): string {
  return `${limit.used} of ${limit.included} people${onPlan(limit)}`
}
