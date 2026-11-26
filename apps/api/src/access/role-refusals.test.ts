import {
  defaultPermissions,
  defaultRole,
  emptyPermissionSet,
  type PermissionSet,
  type SystemRoleKey,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import type { ManageViewer } from './manage-rules'
import { mayAssign, type RoleSubject, roleRefusal, roleRights } from './role-refusals'

const perms = (key: SystemRoleKey) => defaultPermissions(defaultRole(key))
const ask = { ownerName: 'Olumide Bankole', permissionMessage: 'Only owners and admins can.' }

function officeManager(): PermissionSet {
  const set = perms('sales')
  set.settings = ['view', 'create', 'edit', 'delete']
  return set
}

function viewOnly(): PermissionSet {
  const set = emptyPermissionSet()
  set.settings = ['view']
  return set
}

const viewer = (
  permissions: PermissionSet,
  options: { roleKey?: SystemRoleKey | null; roleId?: string; entityIds?: string[] | null } = {},
): ManageViewer => ({
  userId: 'me',
  roleId: options.roleId ?? 'my-role',
  roleKey: options.roleKey ?? null,
  permissions,
  entityIds: options.entityIds ?? null,
})

const OWNER = viewer(perms('owner'), { roleKey: 'owner' })
const ADMIN = viewer(perms('admin'), { roleKey: 'admin' })
const LIMITED_ADMIN = viewer(perms('admin'), { roleKey: 'admin', entityIds: ['parkview'] })
const OFFICE = viewer(officeManager(), { roleId: 'office-manager' })
const VIEW_ONLY = viewer(viewOnly())

const builtIn = (key: SystemRoleKey): RoleSubject => ({
  id: `role-${key}`,
  key,
  name: defaultRole(key).name,
  permissions: perms(key),
})
const custom = (id: string, name: string, permissions: PermissionSet): RoleSubject => ({
  id,
  key: null,
  name,
  permissions,
})
const SITE_ENGINEER = custom('site-engineer', 'Site engineer', perms('project_manager'))
const FINANCE_LEAD = custom('finance-lead', 'Finance lead', perms('finance'))
const OFFICE_ROLE = custom('office-manager', 'Office manager', officeManager())

describe('roleRefusal', () => {
  it.each([
    ['owner', OWNER, builtIn('sales'), 'built_in_role'],
    ['owner', OWNER, SITE_ENGINEER, null],
    ['admin', ADMIN, FINANCE_LEAD, null],
    ['a limited admin', LIMITED_ADMIN, SITE_ENGINEER, 'all_entities_required'],
    ['a limited admin', LIMITED_ADMIN, builtIn('sales'), 'all_entities_required'],
    ['a view-only role', VIEW_ONLY, SITE_ENGINEER, 'permission'],
    ['an office manager', OFFICE, OFFICE_ROLE, 'own_role'],
    ['an office manager', OFFICE, FINANCE_LEAD, 'wider_permissions'],
    ['an office manager', OFFICE, custom('sales-lead', 'Sales lead', perms('sales')), null],
  ] as const)('editing: %s × %s → %s', (_who, v, role, expected) => {
    expect(roleRefusal(v, role, 'edit', ask)?.reason ?? null).toBe(expected)
  })

  it.each([
    ['owner', OWNER, builtIn('viewer'), 'built_in_role'],
    ['owner', OWNER, SITE_ENGINEER, null],
    ['a limited admin', LIMITED_ADMIN, SITE_ENGINEER, 'all_entities_required'],
    ['an office manager', OFFICE, OFFICE_ROLE, 'own_role'],
    // Deleting takes no access away from anyone (nobody holds it), so the ceiling doesn't apply.
    ['an office manager', OFFICE, FINANCE_LEAD, null],
  ] as const)('deleting: %s × %s → %s', (_who, v, role, expected) => {
    expect(roleRefusal(v, role, 'delete', ask)?.reason ?? null).toBe(expected)
  })

  it.each([
    ['owner', OWNER, builtIn('owner'), null],
    ['an office manager', OFFICE, builtIn('admin'), 'wider_permissions'],
    ['an office manager', OFFICE, builtIn('sales'), null],
    ['an office manager', OFFICE, OFFICE_ROLE, null],
    ['a limited admin', LIMITED_ADMIN, builtIn('sales'), 'all_entities_required'],
    ['a view-only role', VIEW_ONLY, builtIn('viewer'), 'permission'],
  ] as const)('duplicating: %s × %s → %s', (_who, v, role, expected) => {
    expect(roleRefusal(v, role, 'duplicate', ask)?.reason ?? null).toBe(expected)
  })

  it('words each refusal for the person reading it', () => {
    expect(roleRefusal(OWNER, builtIn('sales'), 'edit', ask)?.message).toBe(
      "Built-in roles can't be changed. Duplicate it to make your own.",
    )
    expect(roleRefusal(OFFICE, OFFICE_ROLE, 'edit', ask)?.message).toBe(
      'You have this role. Ask another owner or admin to change it.',
    )
    expect(roleRefusal(OFFICE, FINANCE_LEAD, 'edit', ask)?.message).toBe(
      "Finance lead can do things you can't. Ask Olumide Bankole (owner) to change it.",
    )
    expect(roleRefusal(LIMITED_ADMIN, SITE_ENGINEER, 'edit', ask)?.message).toBe(
      'Only people with access to every company can change this. Ask Olumide Bankole (owner).',
    )
    expect(roleRefusal(OFFICE, builtIn('admin'), 'duplicate', ask)?.message).toBe(
      'You can only give access you have yourself.',
    )
  })
})

describe('mayAssign', () => {
  it('keeps the owner role to owners and roles beyond the giver hidden', () => {
    expect(mayAssign(OWNER, builtIn('owner'))).toBe(true)
    expect(mayAssign(ADMIN, builtIn('owner'))).toBe(false)
    expect(mayAssign(ADMIN, builtIn('admin'))).toBe(true)
    expect(mayAssign(OFFICE, builtIn('finance'))).toBe(false)
    expect(mayAssign(OFFICE, builtIn('sales'))).toBe(true)
  })
})

describe('roleRights', () => {
  const counted = (role: RoleSubject, memberCount = 0, invitedCount = 0) => ({
    ...role,
    memberCount,
    invitedCount,
  })

  it('lets an admin edit, delete and duplicate an unheld custom role', () => {
    expect(roleRights(ADMIN, counted(SITE_ENGINEER), ask)).toEqual({
      can: { assign: true, edit: true, delete: true, duplicate: true },
      readOnly: null,
    })
  })

  it('offers no delete while anyone holds the role, invitations included', () => {
    expect(roleRights(ADMIN, counted(SITE_ENGINEER, 0, 1), ask).can.delete).toBe(false)
    expect(roleRights(ADMIN, counted(SITE_ENGINEER, 3, 0), ask).can.delete).toBe(false)
  })

  it('shows a built-in role read-only with the page line', () => {
    expect(roleRights(OWNER, counted(builtIn('sales')), ask)).toEqual({
      can: { assign: true, edit: false, delete: false, duplicate: true },
      readOnly: {
        reason: 'built_in',
        message: "Built-in roles can't be changed. Duplicate this role to make your own version.",
      },
    })
  })

  it('gives a view-only role nothing to do and the who-to-ask line', () => {
    expect(roleRights(VIEW_ONLY, counted(SITE_ENGINEER), ask)).toEqual({
      can: { assign: false, edit: false, delete: false, duplicate: false },
      readOnly: { reason: 'permission', message: 'Only owners and admins can.' },
    })
  })
})
