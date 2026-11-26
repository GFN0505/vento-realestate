import { requireAllEntities, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { createRole, deleteRole, getRole, listRoles, updateRole } from './roles.service'

export const rolesRouter = {
  list: member.roles.list
    .use(requirePermission('settings', 'view', 'see roles and permissions'))
    .handler(({ context }) => listRoles(serviceContext(context))),
  get: member.roles.get
    .use(requirePermission('settings', 'view', 'see roles and permissions'))
    .handler(({ context, input }) => getRole(serviceContext(context), input.id)),
  create: member.roles.create
    .use(requirePermission('settings', 'create', 'make roles'))
    .use(requireAllEntities())
    .handler(({ context, input }) => createRole(serviceContext(context), input)),
  update: member.roles.update
    .use(requirePermission('settings', 'edit', 'change roles'))
    .use(requireAllEntities())
    .handler(({ context, input }) => updateRole(serviceContext(context), input)),
  delete: member.roles.delete
    .use(requirePermission('settings', 'delete', 'delete roles'))
    .use(requireAllEntities())
    .handler(({ context, input }) => deleteRole(serviceContext(context), input.id)),
}
