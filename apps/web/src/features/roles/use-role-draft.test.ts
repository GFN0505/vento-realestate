import { toggleCell } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { testCustomRole } from '@/test/me'
import { draftFrom, draftState, updateFrom } from './use-role-draft'

const role = testCustomRole()

describe('role draft', () => {
  it('starts clean from the saved role', () => {
    const state = draftState(role, draftFrom(role))
    expect(state.dirty).toBe(false)
    expect(state.count).toBe(0)
  })

  it('counts the J-ONB-08 edit as 3 changes and sends only the permissions', () => {
    let permissions = toggleCell(role.permissions, 'sales', 'view', false)
    permissions = toggleCell(permissions, 'land', 'view', false)
    permissions = toggleCell(permissions, 'documents', 'create', true)
    const draft = { ...draftFrom(role), permissions }
    expect(draftState(role, draft).count).toBe(3)
    expect(updateFrom(role, draft)).toEqual({ id: role.id, version: 1, permissions })
  })

  it('locks two-step on once the role can do more than view in Finance', () => {
    const draft = {
      ...draftFrom(role),
      permissions: toggleCell(role.permissions, 'finance', 'edit', true),
    }
    const state = draftState(role, draft)
    expect(state.twoStepLocked).toBe(true)
    expect(state.requiresTwoStep).toBe(true)
    expect(updateFrom(role, draft)).toMatchObject({ requiresTwoStep: true })
  })

  it('goes back to the chosen two-step value when the lock lifts', () => {
    const locked = toggleCell(role.permissions, 'finance', 'edit', true)
    const draft = { ...draftFrom(role), permissions: toggleCell(locked, 'finance', 'view', false) }
    expect(draftState(role, draft).requiresTwoStep).toBe(false)
    expect(draftState(role, draft).dirty).toBe(false)
  })

  it('trims the name and counts a rename as a change', () => {
    const draft = { ...draftFrom(role), name: '  Site lead ' }
    expect(draftState(role, draft).count).toBe(1)
    expect(updateFrom(role, draft)).toEqual({ id: role.id, version: 1, name: 'Site lead' })
  })

  it('knows a role with nothing ticked is empty', () => {
    const permissions = Object.fromEntries(
      Object.keys(role.permissions).map((m) => [m, []]),
    ) as unknown as typeof role.permissions
    expect(draftState(role, { ...draftFrom(role), permissions }).empty).toBe(true)
  })
})
