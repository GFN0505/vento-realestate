import { requireAllEntities, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { answerSingleCompany } from '@/modules/organization/organization.service'
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
  // Like adding a company: it answers for the whole group.
  answerSingleCompany: member.checklist.answerSingleCompany
    .use(requirePermission('settings', 'create', 'add companies'))
    .use(requireAllEntities())
    .handler(({ context, input }) =>
      answerSingleCompany(serviceContext(context), input.singleCompany),
    ),
}
