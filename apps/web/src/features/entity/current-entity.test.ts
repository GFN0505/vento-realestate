import type { Entity } from '@vento/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { entityNote, rememberEntity, rememberedEntity, resolveEntity } from './current-entity'

function entity(id: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    name: `Entity ${id}`,
    type: 'spv',
    rcNumber: null,
    tin: null,
    vatRegistered: false,
    baseCurrency: 'NGN',
    status: 'active',
    archivedAt: null,
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    ...overrides,
  }
}

const parkview = entity('parkview', { name: 'Parkview Residences SPV Ltd' })
const holding = entity('holding', { name: 'Vento Homes Ltd', type: 'holding' })
const options = [holding, parkview]

afterEach(() => localStorage.clear())

describe('current entity', () => {
  it('shows all entities when the address names none', () => {
    expect(resolveEntity(undefined, options, null)).toEqual({
      entity: null,
      locked: false,
      invalid: false,
    })
  })

  it('picks the entity the address names', () => {
    expect(resolveEntity('parkview', options, null).entity).toBe(parkview)
  })

  it.each([
    ['made up', 'not-a-real-id'],
    ['outside the limits (not returned by the server)', 'lekki-pearl'],
  ])('treats an id that is %s as unavailable, showing all', (_case, id) => {
    expect(resolveEntity(id, options, null)).toEqual({ entity: null, locked: false, invalid: true })
  })

  it('treats an archived entity as unavailable', () => {
    const archived = entity('old', { status: 'archived' })
    expect(resolveEntity('old', [...options, archived], null).invalid).toBe(true)
  })

  it('locks a member limited to one entity to it, ignoring the address', () => {
    expect(resolveEntity('holding', options, ['parkview'])).toEqual({
      entity: parkview,
      locked: true,
      invalid: false,
    })
  })

  it('remembers the choice per organization', () => {
    rememberEntity('org-a', 'parkview')
    expect(rememberedEntity('org-a')).toBe('parkview')
    expect(rememberedEntity('org-b')).toBeNull()
    rememberEntity('org-a', null)
    expect(rememberedEntity('org-a')).toBeNull()
  })

  it('labels entities by type', () => {
    expect(entityNote(holding)).toBe('Holding company')
    expect(entityNote(parkview)).toBe('SPV')
  })
})
