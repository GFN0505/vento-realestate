import {
  accessContract,
  invitationsContract,
  membersContract,
  rolesContract,
} from './access/contract'
import { accountContract } from './account/contract'
import { approvalRulesContract, approvalsContract } from './approvals/contract'
import { auditContract } from './audit/contract'
import { filesContract } from './files/contract'
import { healthContract } from './health/contract'
import { landContract } from './land/contract'
import { entitiesContract, onboardingContract, organizationContract } from './organization/contract'
import { checklistContract, teamContract } from './team/contract'

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
  access: accessContract,
  team: teamContract,
  checklist: checklistContract,
  approvals: approvalsContract,
  approvalRules: approvalRulesContract,
  audit: auditContract,
  files: filesContract,
  land: landContract,
}
export type Contract = typeof contract
