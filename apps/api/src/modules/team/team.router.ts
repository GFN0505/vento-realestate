import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { listTeam } from './team.service'

export const teamRouter = {
  list: member.team.list
    .use(requirePermission('settings', 'view', 'see the team'))
    .handler(({ context, input }) => listTeam(serviceContext(context), input)),
}
