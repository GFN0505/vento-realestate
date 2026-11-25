import { invitationsContract, membersContract, rolesContract } from './access/contract'
import { accountContract } from './account/contract'
import { healthContract } from './health/contract'
import { entitiesContract, onboardingContract, organizationContract } from './organization/contract'

/** The whole API surface. The server implements it and the web client calls it. */
export const contract = {
  health: healthContract,
  account: accountContract,
  onboarding: onboardingContract,
  organization: organizationContract,
  entities: entitiesContract,
  roles: rolesContract,
  members: membersContract,
  invitations: invitationsContract,
}
export type Contract = typeof contract
