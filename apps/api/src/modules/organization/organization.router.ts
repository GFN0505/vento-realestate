import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { getOrganization, updateOrganization } from './organization.service'

export const organizationRouter = {
  get: member.organization.get.handler(({ context }) => getOrganization(serviceContext(context))),
  update: member.organization.update
    .use(requirePermission('settings', 'edit', 'change organization details'))
    .handler(({ context, input }) => updateOrganization(serviceContext(context), input)),
}
