import { inArray, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { MemberContext } from './context'

/**
 * Narrows a query to the member's entities. Rows outside the limit behave as if they don't
 * exist: callers return NOT_FOUND, never FORBIDDEN, for a specific id.
 */
export function entityScope(
  member: Pick<MemberContext, 'entityIds'>,
  column: AnyPgColumn,
): SQL | undefined {
  if (member.entityIds === null) return undefined
  return member.entityIds.length ? inArray(column, member.entityIds) : sql`false`
}
