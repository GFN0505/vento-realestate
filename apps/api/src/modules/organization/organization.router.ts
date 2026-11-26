import { requireAllEntities, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { member } from '@/orpc'
import {
  getOrganization,
  getOrganizationSecurity,
  setTwoStepRequired,
  updateOrganization,
} from './organization.service'

export const organizationRouter = {
  get: member.organization.get.handler(({ context }) => getOrganization(serviceContext(context))),
  update: member.organization.update
    .use(requirePermission('settings', 'edit', 'change organization details'))
    .use(requireAllEntities())
    .handler(({ context, input }) => updateOrganization(serviceContext(context), input)),
  security: member.organization.security
    .use(requirePermission('settings', 'view', 'see organization settings'))
    .handler(({ context }) => getOrganizationSecurity(serviceContext(context))),
  // Owners only, checked in the service against the live role.
  setTwoStepRequired: member.organization.setTwoStepRequired
    .use(requirePermission('settings', 'edit', 'change organization security'))
    .use(requireAllEntities())
    .handler(async ({ context, input }) => {
      const { emails, ...result } = await setTwoStepRequired(serviceContext(context), input)
      await sendAll(context.mailer, emails)
      return result
    }),
}
