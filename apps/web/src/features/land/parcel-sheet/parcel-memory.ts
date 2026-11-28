import { NIGERIAN_STATES, type NigerianState } from '@vento/shared'
import { readJson, writeJson } from '@/lib/storage'

/*
 * Add parcel remembers, per organization on this device, the state and company last used: a
 * developer's land is mostly in one state and bought by one company at a time (excellence
 * checklist: memory of last-used values). Never shared, never sent.
 */

type Memory = { state: NigerianState | ''; entityId: string }

const key = (organizationId: string) => `vento:land:add-parcel:${organizationId}`

const isMemory = (value: unknown): value is Partial<Memory> =>
  typeof value === 'object' && value !== null

export function rememberedParcelDefaults(organizationId: string | undefined): Memory {
  const stored = organizationId ? readJson(key(organizationId), isMemory) : null
  return {
    state: NIGERIAN_STATES.find((s) => s === stored?.state) ?? '',
    entityId: typeof stored?.entityId === 'string' ? stored.entityId : '',
  }
}

export function rememberParcelDefaults(organizationId: string | undefined, memory: Memory): void {
  if (organizationId) writeJson(key(organizationId), memory)
}
