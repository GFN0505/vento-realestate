import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { whoCanChangeAccess } from './access.service'

export const accessRouter = {
  // No permission check: every member may learn who to ask, which is what the 403 page shows.
  whoCanChangeAccess: member.access.whoCanChangeAccess.handler(({ context, input }) =>
    whoCanChangeAccess(serviceContext(context), input.module),
  ),
}
