import { defaultPermissions, defaultRole, emptyPermissionSet } from '@vento/shared'
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
  roleKey,
  permissions: roleKey ? defaultPermissions(defaultRole(roleKey)) : viewOnly(),
  entityIds,
})

function viewOnly() {
  const set = emptyPermissionSet()
  set.settings = ['view']
  return set
}

const member = (roleKey: string, entityIds: string[] | null = ALL, userId = 'them') => ({
  userId,
  name: 'Aisha Bello',
  roleKey,
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
      "Aisha Bello has access to entities you can't see. Ask Olumide Bankole (owner) to change it.",
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
    const invitation = { email: 'aisha@ventohomes.ng', roleKey: 'owner', entityIds: ALL }
    expect(invitationRefusal(viewer('admin'), invitation, 'resend', opts)).toEqual({
      reason: 'owner_only',
      message: 'Only owners can resend an owner invitation.',
    })
    expect(invitationRefusal(viewer('admin'), invitation, 'withdraw', opts)).toBeNull()
    expect(invitationRefusal(viewer('owner'), invitation, 'resend', opts)).toBeNull()
  })

  it.each(['resend', 'withdraw'] as const)('refuses a wider invitation (%s)', (action) => {
    const invitation = { email: 'aisha@ventohomes.ng', roleKey: 'sales', entityIds: [L] }
    expect(invitationRefusal(viewer('admin', [P]), invitation, action, opts)?.message).toBe(
      "The invitation to aisha@ventohomes.ng includes entities you can't see. Ask Olumide Bankole (owner) to change it.",
    )
  })
})

describe('row rights for team.list', () => {
  it('gives an owner every action on a sales member with two-step on', () => {
    expect(memberRowRights(viewer('owner'), { ...member('sales'), twoStep: 'on' }, null)).toEqual({
      can: { changeAccess: true, resetTwoStep: true, remove: true },
      readOnly: null,
    })
  })

  it('offers reset only while two-step is on', () => {
    const rights = memberRowRights(viewer('owner'), { ...member('sales'), twoStep: 'off' }, null)
    expect(rights.can.resetTwoStep).toBe(false)
  })

  it('gives a view-only role no actions, and no read-only line', () => {
    expect(memberRowRights(viewer(null), { ...member('sales'), twoStep: 'on' }, null)).toEqual({
      can: { changeAccess: false, resetTwoStep: false, remove: false },
      readOnly: null,
    })
  })

  it.each([
    ['self', viewer('owner'), member('owner', ALL, 'me')],
    ['owner', viewer('admin'), member('owner')],
    ['wider_access', viewer('admin', [P]), member('sales', [P, L])],
  ] as const)('marks the row read-only for %s', (reason, v, target) => {
    const rights = memberRowRights(v, { ...target, twoStep: 'on' }, 'Olumide Bankole')
    expect(rights.can).toEqual({ changeAccess: false, resetTwoStep: false, remove: false })
    expect(rights.readOnly?.reason).toBe(reason)
  })

  it('tells the viewer about their own row in the sheet’s words', () => {
    const rights = memberRowRights(
      viewer('admin'),
      { ...member('admin', ALL, 'me'), twoStep: 'on' },
      null,
    )
    expect(rights.readOnly?.message).toBe(
      'This is you. Ask another owner or admin to change your access.',
    )
  })

  it('leaves an owner invitation withdrawable by an admin, not read-only', () => {
    const invitation = { email: 'a@b.ng', roleKey: 'owner', entityIds: ALL }
    expect(invitationRowRights(viewer('admin'), invitation, null)).toEqual({
      can: { resend: false, withdraw: true },
      readOnly: null,
    })
  })

  it('makes a wider invitation read-only for a limited admin', () => {
    const invitation = { email: 'a@b.ng', roleKey: 'sales', entityIds: ALL }
    const rights = invitationRowRights(viewer('admin', [P]), invitation, 'Olumide Bankole')
    expect(rights.can).toEqual({ resend: false, withdraw: false })
    expect(rights.readOnly?.reason).toBe('wider_access')
  })
})
