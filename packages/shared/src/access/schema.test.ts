import { describe, expect, it } from 'vitest'
import { defaultPermissions, defaultRole } from './default-roles'
import { emptyPermissionSet } from './permissions'
import { createRoleInput, entityLimit, updateRoleInput } from './schema'

const roleId = '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f'

describe('createRoleInput', () => {
  it('trims the name and needs 2 to 40 characters', () => {
    expect(createRoleInput.parse({ name: ' Site engineer ', sourceRoleId: roleId }).name).toBe(
      'Site engineer',
    )
    const short = createRoleInput.safeParse({ name: 'S', sourceRoleId: roleId })
    expect(short.error?.issues[0]?.message).toBe('Enter a name for the role')
    const long = createRoleInput.safeParse({ name: 'x'.repeat(41), sourceRoleId: roleId })
    expect(long.error?.issues[0]?.message).toBe('Use 40 characters or fewer')
  })

  it('refuses hidden characters in the name', () => {
    expect(
      createRoleInput.safeParse({ name: 'Site\nengineer', sourceRoleId: roleId }).success,
    ).toBe(false)
  })
})

describe('updateRoleInput', () => {
  it('needs the loaded version and at least one ticked area', () => {
    const empty = updateRoleInput.safeParse({
      id: roleId,
      version: 1,
      permissions: emptyPermissionSet(),
    })
    expect(empty.error?.issues[0]?.message).toBe('Give this role access to at least one area')
    expect(updateRoleInput.safeParse({ id: roleId, name: 'Site engineer' }).success).toBe(false)
  })

  it('accepts a partial change', () => {
    const parsed = updateRoleInput.parse({
      id: roleId,
      version: 3,
      permissions: defaultPermissions(defaultRole('viewer')),
    })
    expect(parsed.version).toBe(3)
    expect(parsed.name).toBeUndefined()
  })
})

describe('entityLimit', () => {
  it('says company, not entity', () => {
    expect(entityLimit.safeParse([]).error?.issues[0]?.message).toBe(
      'Choose at least one company, or allow all',
    )
  })
})
