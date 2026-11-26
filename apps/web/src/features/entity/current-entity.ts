import type { Entity } from '@vento/shared'
import { readItem, writeItem } from '@/lib/storage'

/*
 * Decision 0014: the current entity is a view filter held in the page address (`?entity=`) and
 * remembered per organization on this device. It never grants access; the server intersects it
 * with the member's entity limits once list procedures take it.
 */

export const ENTITY_NOT_AVAILABLE = "That entity isn't available. Showing all entities."

const key = (organizationId: string) => `vento-entity:${organizationId}`

export function rememberedEntity(organizationId: string): string | null {
  return readItem(key(organizationId))
}

export function rememberEntity(organizationId: string, entityId: string | null) {
  writeItem(key(organizationId), entityId)
}

export type EntityView = {
  /** null = all entities. */
  entity: Entity | null
  /** Limited to exactly one entity: a label, no menu, and the address is ignored. */
  locked: boolean
  /** The address named an entity this person can't use (unknown, archived, outside limits). */
  invalid: boolean
}

/**
 * Which entity the page shows. `options` are the active entities the server returned for this
 * member (already limited). The same answer for unknown, archived and out-of-limit ids, so a
 * link never reveals whether an entity exists.
 */
export function resolveEntity(
  requested: string | undefined,
  options: readonly Entity[],
  memberEntityIds: readonly string[] | null,
): EntityView {
  if (memberEntityIds?.length === 1) {
    const only = options.find((e) => e.id === memberEntityIds[0]) ?? null
    return { entity: only, locked: true, invalid: false }
  }
  if (!requested) return { entity: null, locked: false, invalid: false }
  const found = options.find((e) => e.id === requested && e.status === 'active')
  return found
    ? { entity: found, locked: false, invalid: false }
    : { entity: null, locked: false, invalid: true }
}

/** "Holding company" or "SPV": the note beside each entity in the switcher. */
export function entityNote(entity: Pick<Entity, 'type'>): string {
  return entity.type === 'holding' ? 'Holding company' : 'SPV'
}
