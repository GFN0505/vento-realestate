import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { entities } from '@/db/schema'
import { conflict, forbidden, notFound } from '@/lib/errors'
import type { ServiceContext } from './context'

const ENTITY_UNAVAILABLE = 'One of the entities you chose is no longer available. Choose again.'

/**
 * Entities a granter may put in a limit (member update or invitation). They must be this
 * organization's and active, and a granter limited to some entities can only grant within them:
 * they can't give "all entities", and an entity outside their limit is not found, as everywhere.
 * An archived entity of this organization is `entity_unavailable` (the sheet refetches).
 */
export async function assertGrantableEntities(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'member'>,
  entityIds: string[] | null,
) {
  const granterLimit = ctx.member.entityIds
  if (granterLimit !== null) {
    if (entityIds === null) {
      throw forbidden(
        'entity_limit',
        'You can only give access to the entities you can see. Choose them instead of all entities.',
      )
    }
    if (entityIds.some((id) => !granterLimit.includes(id))) throw notFound()
  }
  if (!entityIds) return []
  const unique = [...new Set(entityIds)]
  const rows = await tx
    .select({ id: entities.id, name: entities.name, status: entities.status })
    .from(entities)
    .where(and(eq(entities.organizationId, ctx.organizationId), inArray(entities.id, unique)))
  if (rows.length !== unique.length) throw notFound()
  if (rows.some((r) => r.status !== 'active')) {
    throw conflict('entity_unavailable', ENTITY_UNAVAILABLE)
  }
  return rows.map(({ id, name }) => ({ id, name }))
}
