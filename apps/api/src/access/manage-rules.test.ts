import {
  defaultPermissions,
  defaultRole,
  emptyPermissionSet,
  type SystemRoleKey,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  invitationRefusal,
  invitationRowRights,
  type ManageViewer,
  type MemberAction,
  memberRefusal,
  memberRowRights,
  withinGranterAccess,
} from './manage-rules'

const P = 'parkview'
const L = 'lekki'
const ALL = null

const viewer = (
  roleKey: 'owner' | 'admin' | null,
  entityIds: string[] | null = ALL,
): ManageViewer => ({
  userId: 'me',
  roleId: `role-${roleKey ?? 'custom'}`,
  roleKey,
  permissions: roleKey ? defaultPermissions(defaultRole(roleKey)) : viewOnly(),
  entityIds,
})

function viewOnly() {
  const set = emptyPermissionSet()
  set.settings = ['view']
  return set
}

const perms = (key: SystemRoleKey) => defaultPermissions(defaultRole(key))

const member = (roleKey: SystemRoleKey, entityIds: string[] | null = ALL, userId = 'them') => ({
  userId,
  name: 'Aisha Bello',
  roleKey,
  permissions: perms(roleKey),
  entityIds,
})

const invitation = (roleKey: SystemRoleKey, entityIds: string[] | null = ALL) => ({
  email: 'aisha@ventohomes.ng',
  roleKey,
  permissions: perms(roleKey),
  entityIds,
})

const opts = { ownerName: 'Olumide Bankole' }

describe('withinGranterAccess', () => {
  it.each([
    [ALL, ALL, true],
    [ALL, [P], true],
    [ALL, [P, L], true],
    [[P], ALL, false],
    [[P], [P], true],
    [[P], [L], false],
    [[P], [P, L], false],
    [[P, L], ALL, false],
    [[P, L], [P], true],
    [[P, L], [L], true],
    [[P, L], [P, L], true],
  ])('granter %j, target %j → %s', (granter, target, expected) => {
    expect(withinGranterAccess(granter, target)).toBe(expected)
  })
})

describe('memberRefusal', () => {
  const actions: MemberAction[] = ['change', 'reset', 'remove']

  it.each(actions)('refuses anyone their own access (%s)', (action) => {
    expect(memberRefusal(viewer('owner'), member('owner', ALL, 'me'), action, opts)?.reason).toBe(
      'own_access',
    )
  })

  it.each(actions)("keeps an owner's row to owners (%s)", (action) => {
    expect(memberRefusal(viewer('admin'), member('owner'), action, opts)?.reason).toBe('owner_only')
    expect(memberRefusal(viewer('owner'), member('owner'), action, opts)).toBeNull()
  })

  it('lets only owners make someone an owner', () => {
    expect(
      memberRefusal(viewer('admin'), member('sales'), 'change', { ...opts, newRoleKey: 'owner' }),
    ).toEqual({ reason: 'owner_only', message: 'Only owners can make someone an owner.' })
    expect(
      memberRefusal(viewer('owner'), member('sales'), 'change', { ...opts, newRoleKey: 'owner' }),
    ).toBeNull()
  })

  it.each([
    [[P], ALL, 'entity_limit'],
    [[P], [L], 'entity_limit'],
    [[P], [P, L], 'entity_limit'],
    [[P], [P], null],
    [[P, L], [L], null],
    [ALL, ALL, null],
  ] as const)('a viewer limited to %j managing someone with %j → %s', (mine, theirs, expected) => {
    for (const action of actions) {
      const refusal = memberRefusal(
        viewer('admin', mine ? [...mine] : null),
        member('sales', theirs ? [...theirs] : null),
        action,
        opts,
      )
      expect(refusal?.reason ?? null).toBe(expected)
    }
  })

  it('names who to ask when the access is wider', () => {
    expect(memberRefusal(viewer('admin', [P]), member('sales', [L]), 'remove', opts)?.message).toBe(
      "Aisha Bello has access to companies you can't see. Ask Olumide Bankole (owner) to change it.",
    )
  })

  it('applies the rule to a limited owner too, and checks self before owner before access', () => {
    expect(memberRefusal(viewer('owner', [P]), member('sales', ALL), 'change', opts)?.reason).toBe(
      'entity_limit',
    )
    expect(memberRefusal(viewer('admin', [P]), member('owner', ALL), 'change', opts)?.reason).toBe(
      'owner_only',
    )
  })
})

describe('invitationRefusal', () => {
  it('keeps resending an owner invitation to owners, but lets an admin withdraw it', () => {
    const owner = invitation('owner')
    expect(invitationRefusal(viewer('admin'), owner, 'resend', opts)).toEqual({
      reason: 'owner_only',
      message: 'Only owners can resend an owner invitation.',
    })
    expect(invitationRefusal(viewer('admin'), owner, 'withdraw', opts)).toBeNull()
    expect(invitationRefusal(viewer('owner'), owner, 'resend', opts)).toBeNull()
  })

  it.each(['resend', 'withdraw'] as const)('refuses a wider invitation (%s)', (action) => {
    expect(
      invitationRefusal(viewer('admin', [P]), invitation('sales', [L]), action, opts)?.message,
    ).toBe(
      "The invitation to aisha@ventohomes.ng includes companies you can't see. Ask Olumide Bankole (owner) to change it.",
    )
  })
})

describe('row rights for team.list', () => {
  it('gives an owner every action on a sales member with two-step on', () => {
    expect(
      memberRowRights(
        viewer('owner'),
        { ...member('sales'), twoStep: 'on', passkeyCount: 0 },
        null,
      ),
    ).toEqual({
      can: { changeAccess: true, resetTwoStep: true, remove: true },
      readOnly: null,
    })
  })

  it('offers reset only while two-step is on or they have a passkey', () => {
    const rights = memberRowRights(
      viewer('owner'),
      { ...member('sales'), twoStep: 'off', passkeyCount: 0 },
      null,
    )
    expect(rights.can.resetTwoStep).toBe(false)
  })

  it('offers reset to someone with a passkey and two-step off, so a lost phone is cut off', () => {
    const target = { ...member('sales'), twoStep: 'off' as const, passkeyCount: 1 }
    expect(memberRowRights(viewer('owner'), target, null).can.resetTwoStep).toBe(true)
  })

  it('gives a view-only role no actions, and no read-only line', () => {
    expect(
      memberRowRights(viewer(null), { ...member('sales'), twoStep: 'on', passkeyCount: 0 }, null),
    ).toEqual({
      can: { changeAccess: false, resetTwoStep: false, remove: false },
      readOnly: null,
    })
  })

  it.each([
    ['self', viewer('owner'), member('owner', ALL, 'me')],
    ['owner', viewer('admin'), member('owner')],
    ['wider_access', viewer('admin', [P]), member('sales', [P, L])],
  ] as const)('marks the row read-only for %s', (reason, v, target) => {
    const rights = memberRowRights(
      v,
      { ...target, twoStep: 'on', passkeyCount: 0 },
      'Olumide Bankole',
    )
    expect(rights.can).toEqual({ changeAccess: false, resetTwoStep: false, remove: false })
    expect(rights.readOnly?.reason).toBe(reason)
  })

  it('tells the viewer about their own row in the sheet’s words', () => {
    const rights = memberRowRights(
      viewer('admin'),
      { ...member('admin', ALL, 'me'), twoStep: 'on', passkeyCount: 0 },
      null,
    )
    expect(rights.readOnly?.message).toBe(
      'This is you. Ask another owner or admin to change your access.',
    )
  })

  it('leaves an owner invitation withdrawable by an admin, not read-only', () => {
    expect(invitationRowRights(viewer('admin'), invitation('owner'), null)).toEqual({
      can: { resend: false, withdraw: true },
      readOnly: null,
    })
  })

  it('makes a wider invitation read-only for a limited admin', () => {
    const rights = invitationRowRights(viewer('admin', [P]), invitation('sales'), 'Olumide Bankole')
    expect(rights.can).toEqual({ resend: false, withdraw: false })
    expect(rights.readOnly?.reason).toBe('wider_access')
  })
})

// The permission ceiling (brick 3c). "Office manager" is a custom role with Settings create,
// edit and delete plus everything Sales has, but no Finance or HR.
function officeManagerPermissions() {
  const set = perms('sales')
  set.settings = ['view', 'create', 'edit', 'delete']
  return set
}

const customViewer = (kind: 'office_manager' | 'view_only'): ManageViewer => ({
  userId: 'me',
  roleId: `role-${kind}`,
  roleKey: null,
  permissions: kind === 'office_manager' ? officeManagerPermissions() : viewOnly(),
  entityIds: ALL,
})

const VIEWERS = {
  owner: viewer('owner'),
  admin: viewer('admin'),
  office_manager: customViewer('office_manager'),
  view_only: customViewer('view_only'),
} as const

const TARGETS = {
  owner: perms('owner'),
  admin: perms('admin'),
  finance: perms('finance'),
  office_manager: officeManagerPermissions(),
} as const

type V = keyof typeof VIEWERS
type T = keyof typeof TARGETS
type Reason = 'owner_only' | 'wider_permissions' | null

// Expected refusal for every viewer × target, the same for change, reset and remove.
const EXPECTED: Record<V, Record<T, Reason>> = {
  owner: { owner: null, admin: null, finance: null, office_manager: null },
  admin: { owner: 'owner_only', admin: null, finance: null, office_manager: null },
  office_manager: {
    owner: 'owner_only',
    admin: 'wider_permissions',
    finance: 'wider_permissions',
    office_manager: null,
  },
  view_only: {
    owner: 'owner_only',
    admin: 'wider_permissions',
    finance: 'wider_permissions',
    office_manager: 'wider_permissions',
  },
}

const targetOf = (t: T) => ({
  userId: 'them',
  name: 'Kemi Adebayo',
  roleKey: t === 'office_manager' ? null : t,
  permissions: TARGETS[t],
  entityIds: ALL,
})

const cells = (Object.keys(VIEWERS) as V[]).flatMap((v) =>
  (Object.keys(TARGETS) as T[]).flatMap((t) =>
    (['change', 'reset', 'remove'] as const).map((a) => [v, t, a, EXPECTED[v][t]] as const),
  ),
)

describe('permission ceiling on people', () => {
  it.each(cells)('%s → %s (%s): %s', (v, t, action, expected) => {
    expect(memberRefusal(VIEWERS[v], targetOf(t), action, opts)?.reason ?? null).toBe(expected)
  })

  it.each([
    ['owner', 'admin', null],
    ['admin', 'admin', null],
    ['office_manager', 'admin', 'wider_permissions'],
    ['office_manager', 'sales', null],
    ['view_only', 'sales', 'wider_permissions'],
  ] as const)('%s giving a sales person the %s role: %s', (v, newRole, expected) => {
    const target = { ...targetOf('office_manager'), roleKey: 'sales', permissions: perms('sales') }
    // A view-only viewer is already refused by the target being wider.
    const refusal = memberRefusal(VIEWERS[v], target, 'change', {
      ...opts,
      newRoleKey: newRole,
      newRolePermissions: perms(newRole),
    })
    expect(refusal?.reason ?? null).toBe(expected)
  })

  it('says who to ask about someone wider, and the granting rule for a wider new role', () => {
    const om = VIEWERS.office_manager
    expect(memberRefusal(om, targetOf('admin'), 'remove', opts)?.message).toBe(
      "Kemi Adebayo can do things you can't. Ask Olumide Bankole (owner) to change it.",
    )
    const sales = { ...targetOf('office_manager'), permissions: perms('sales') }
    expect(
      memberRefusal(om, sales, 'change', { ...opts, newRolePermissions: perms('admin') })?.message,
    ).toBe('You can only give access you have yourself.')
  })

  it('checks self before wider, and owner before wider', () => {
    const om = VIEWERS.office_manager
    expect(memberRefusal(om, { ...targetOf('admin'), userId: 'me' }, 'change', opts)?.reason).toBe(
      'own_access',
    )
    expect(memberRefusal(om, targetOf('owner'), 'change', opts)?.reason).toBe('owner_only')
  })

  it('checks wider permissions before wider company access', () => {
    const limitedOm = { ...VIEWERS.office_manager, entityIds: [P] }
    expect(
      memberRefusal(limitedOm, { ...targetOf('admin'), entityIds: [L] }, 'change', opts)?.reason,
    ).toBe('wider_permissions')
  })
})

describe('permission ceiling on invitations', () => {
  const inv = (t: T) => ({
    email: 'kemi@ventohomes.ng',
    roleKey: t === 'office_manager' ? null : t,
    permissions: TARGETS[t],
    entityIds: ALL,
  })

  it.each([
    ['owner', 'owner', 'resend', null],
    ['admin', 'owner', 'resend', 'owner_only'],
    ['admin', 'owner', 'withdraw', null],
    ['office_manager', 'owner', 'resend', 'owner_only'],
    ['office_manager', 'owner', 'withdraw', 'wider_permissions'],
    ['office_manager', 'finance', 'resend', 'wider_permissions'],
    ['office_manager', 'finance', 'withdraw', 'wider_permissions'],
    ['office_manager', 'office_manager', 'resend', null],
    ['view_only', 'office_manager', 'withdraw', 'wider_permissions'],
  ] as const)('%s → %s invitation (%s): %s', (v, t, action, expected) => {
    expect(invitationRefusal(VIEWERS[v], inv(t), action, opts)?.reason ?? null).toBe(expected)
  })

  it('makes a wider invitation read-only for an office manager, naming the owner', () => {
    const rights = invitationRowRights(VIEWERS.office_manager, inv('finance'), 'Olumide Bankole')
    expect(rights).toEqual({
      can: { resend: false, withdraw: false },
      readOnly: {
        reason: 'wider_permissions',
        message:
          "The invitation to kemi@ventohomes.ng gives access you don't have. Ask Olumide Bankole (owner) to change it.",
      },
    })
  })
})

describe('row rights with the ceiling', () => {
  it("marks an admin's row read-only for an office manager, with the owner's name", () => {
    const rights = memberRowRights(
      VIEWERS.office_manager,
      { ...targetOf('admin'), twoStep: 'on', passkeyCount: 0 },
      'Olumide Bankole',
    )
    expect(rights).toEqual({
      can: { changeAccess: false, resetTwoStep: false, remove: false },
      readOnly: {
        reason: 'wider_permissions',
        message: "Kemi Adebayo can do things you can't. Ask Olumide Bankole (owner) to change it.",
      },
    })
  })

  it('shows a view-only viewer no ceiling line, since they manage nobody', () => {
    const rights = memberRowRights(
      VIEWERS.view_only,
      { ...targetOf('admin'), twoStep: 'on', passkeyCount: 0 },
      null,
    )
    expect(rights.readOnly).toBeNull()
  })

  it('lets an office manager manage someone with the same permissions', () => {
    const rights = memberRowRights(
      VIEWERS.office_manager,
      { ...targetOf('office_manager'), twoStep: 'on', passkeyCount: 0 },
      null,
    )
    expect(rights.can).toEqual({ changeAccess: true, resetTwoStep: true, remove: true })
  })
})
