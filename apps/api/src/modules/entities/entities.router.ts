import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import {
  archiveEntity,
  archivePreview,
  createEntity,
  getEntity,
  listEntities,
  updateEntity,
} from './entities.service'

// Every member can see the entities in their limit; changes are Settings actions.
export const entitiesRouter = {
  list: member.entities.list.handler(({ context, input }) =>
    listEntities(serviceContext(context), input),
  ),
  get: member.entities.get.handler(({ context, input }) =>
    getEntity(serviceContext(context), input.id),
  ),
  create: member.entities.create
    .use(requirePermission('settings', 'create', 'add entities'))
    .handler(({ context, input }) => createEntity(serviceContext(context), input)),
  update: member.entities.update
    .use(requirePermission('settings', 'edit', 'edit entities'))
    .handler(({ context, input }) => updateEntity(serviceContext(context), input)),
  archivePreview: member.entities.archivePreview
    .use(requirePermission('settings', 'delete', 'archive entities'))
    .handler(({ context, input }) => archivePreview(serviceContext(context), input.id)),
  archive: member.entities.archive
    .use(requirePermission('settings', 'delete', 'archive entities'))
    .handler(({ context, input }) => archiveEntity(serviceContext(context), input.id)),
}
