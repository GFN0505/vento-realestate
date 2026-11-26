import { accessRouter } from '@/modules/access/access.router'
import { accountRouter } from '@/modules/account/account.router'
import { checklistRouter } from '@/modules/checklist/checklist.router'
import { entitiesRouter } from '@/modules/entities/entities.router'
import { healthRouter } from '@/modules/health/health.router'
import { invitationsRouter } from '@/modules/invitations/invitations.router'
import { membersRouter } from '@/modules/members/members.router'
import { onboardingRouter } from '@/modules/onboarding/onboarding.router'
import { organizationRouter } from '@/modules/organization/organization.router'
import { rolesRouter } from '@/modules/roles/roles.router'
import { teamRouter } from '@/modules/team/team.router'
import { os } from '@/orpc'
import { consoleRouter } from '@/platform/console/console.router'

export const router = os.router({
  health: healthRouter,
  account: accountRouter,
  onboarding: onboardingRouter,
  organization: organizationRouter,
  entities: entitiesRouter,
  roles: rolesRouter,
  members: membersRouter,
  invitations: invitationsRouter,
  access: accessRouter,
  team: teamRouter,
  checklist: checklistRouter,
  console: consoleRouter,
})
export type Router = typeof router

/** Procedures that answer without a session. Everything else must return UNAUTHORIZED. */
export const PUBLIC_PROCEDURES = [
  'health.check',
  'account.passwordResetInfo',
  'invitations.preview',
  'invitations.acceptAsNewUser',
  'invitations.decline',
] as const
