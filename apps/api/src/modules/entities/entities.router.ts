import { requireAllEntities, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import {
  archiveEntity,
  archivePreview,
  createEntity,
  getEntity,
  listEntities,
  restoreEntity,
  updateEntity,
} from './entities.service'

// Every member can see the companies in their limit; changes are Settings actions. Adding,
// archiving and restoring change the whole group, so they need access to every company; a
// limited admin can still fix their own company's details.
export const entitiesRouter = {
  list: member.entities.list.handler(({ context, input }) =>
    listEntities(serviceContext(context), input),
  ),
  get: member.entities.get.handler(({ context, input }) =>
    getEntity(serviceContext(context), input.id),
  ),
  create: member.entities.create
    .use(requirePermission('settings', 'create', 'add companies'))
    .use(requireAllEntities())
    .handler(({ context, input }) => createEntity(serviceContext(context), input)),
  update: member.entities.update
    .use(requirePermission('settings', 'edit', 'edit companies'))
    .handler(({ context, input }) => updateEntity(serviceContext(context), input)),
  archivePreview: member.entities.archivePreview
    .use(requirePermission('settings', 'delete', 'archive companies'))
    .use(requireAllEntities())
    .handler(({ context, input }) => archivePreview(serviceContext(context), input.id)),
  archive: member.entities.archive
    .use(requirePermission('settings', 'delete', 'archive companies'))
    .use(requireAllEntities())
    .handler(({ context, input }) => archiveEntity(serviceContext(context), input.id)),
  restore: member.entities.restore
    .use(requirePermission('settings', 'delete', 'restore companies'))
    .use(requireAllEntities())
    .handler(({ context, input }) => restoreEntity(serviceContext(context), input.id)),
}
