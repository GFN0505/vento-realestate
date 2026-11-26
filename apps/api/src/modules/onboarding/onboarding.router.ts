import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { authed, memberPendingTwoStep } from '@/orpc'
import { createFirstEntity, createOrganization } from './onboarding.service'

// Onboarding runs before two-step setup: owners set it up right after step 2.
export const onboardingRouter = {
  createOrganization: authed.onboarding.createOrganization.handler(({ context, input }) =>
    createOrganization(context.db, { user: context.user, sessionId: context.session.id }, input),
  ),
  createFirstEntity: memberPendingTwoStep.onboarding.createFirstEntity
    .use(requirePermission('settings', 'create', 'add companies'))
    .handler(({ context, input }) => createFirstEntity(serviceContext(context), input)),
}
