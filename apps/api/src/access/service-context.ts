import type { BaseContext } from '@/context'
import type { AuthSession, AuthUser, MemberContext, ServiceContext } from './context'

type MemberRequestContext = BaseContext & {
  user: AuthUser
  session: AuthSession
  organizationId: string
  organizationName: string
  member: MemberContext
}

/** Narrows the request context to what services may use. */
export function serviceContext(context: MemberRequestContext): ServiceContext {
  return {
    db: context.db,
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    user: { id: context.user.id, name: context.user.name, email: context.user.email },
    member: context.member,
    sessionId: context.session.id,
  }
}
