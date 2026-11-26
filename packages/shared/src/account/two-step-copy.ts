import type { TwoStepRequirement } from './security'

// One place for the words, so the server's refusal and My security's line can't drift.

/** The refusal when someone tries to turn two-step off while it's required. */
export function twoStepRefusal(req: TwoStepRequirement): string {
  switch (req.reason) {
    case 'role':
      return `Two-step is required for your role${req.roleName ? ` (${req.roleName})` : ''} in ${req.organizationName}, so it can't be turned off.`
    case 'organization':
      return `${req.organizationName} requires two-step for everyone, so it can't be turned off.`
    case 'reset':
      return 'Your two-step was reset, so set it up again before changing it.'
  }
}

/** The muted line under "Two-step sign-in" on My security. */
export function twoStepRequiredLine(req: TwoStepRequirement): string {
  switch (req.reason) {
    case 'role':
      return req.roleName ? `Required for your role (${req.roleName})` : 'Required for your role'
    case 'organization':
      return `Required by ${req.organizationName}`
    case 'reset':
      return 'Required after a reset by an owner or admin'
  }
}
