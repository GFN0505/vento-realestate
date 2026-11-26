import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { getChecklist, hideChecklist, showChecklist } from './checklist.service'

// Only people who can invite (settings create) see the checklist.
const canSetUp = () => requirePermission('settings', 'create', 'finish setting up')

export const checklistRouter = {
  get: member.checklist.get
    .use(canSetUp())
    .handler(({ context }) => getChecklist(serviceContext(context))),
  hide: member.checklist.hide
    .use(canSetUp())
    .handler(({ context }) => hideChecklist(serviceContext(context))),
  show: member.checklist.show
    .use(canSetUp())
    .handler(({ context }) => showChecklist(serviceContext(context))),
}
