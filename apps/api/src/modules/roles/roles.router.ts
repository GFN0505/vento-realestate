import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { listRoles } from './roles.service'

export const rolesRouter = {
  list: member.roles.list
    .use(requirePermission('settings', 'view', 'see roles and permissions'))
    .handler(({ context }) => listRoles(serviceContext(context))),
}
