import {
  defaultRoleAllows,
  type PermissionAction,
  SYSTEM_ROLE_KEYS,
  type SystemRoleKey,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { uniqueEmail, withRollback } from './db'
import { createEntity, createInvitation, createMember, createOrganization } from './factories'
import { clientAs } from './router-client'

type Client = ReturnType<typeof clientAs>['client']
type Case = {
  name: string
  action: PermissionAction | 'member'
  call: (c: Client) => Promise<unknown>
}

/** Builds an organization with something to act on for every Settings procedure. */
async function world(tx: DbOrTx, role: SystemRoleKey) {
  const org = await createOrganization(tx)
  const parkview = await createEntity(tx, org)
  const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
  const actor = role === 'owner' ? { user: org.owner } : await createMember(tx, org, { role })
  const [a, b, c] = [
    await createMember(tx, org, { role: 'sales' }),
    await createMember(tx, org, { role: 'sales' }),
    await createMember(tx, org, { role: 'sales' }),
  ]
  const inv1 = await createInvitation(tx, org, { role: 'viewer' })
  const inv2 = await createInvitation(tx, org, { role: 'viewer' })
  const viewer = org.roleIds.get('viewer') ?? ''
  const cases: Case[] = [
    { name: 'organization.get', action: 'member', call: (x) => x.organization.get() },
    { name: 'entities.list', action: 'member', call: (x) => x.entities.list({}) },
    { name: 'entities.get', action: 'member', call: (x) => x.entities.get({ id: parkview.id }) },
    {
      name: 'organization.update',
      action: 'edit',
      call: (x) => x.organization.update({ name: 'Vento Homes Ltd' }),
    },
    {
      name: 'entities.create',
      action: 'create',
      call: (x) => x.entities.create({ name: 'New SPV Ltd', type: 'spv' }),
    },
    {
      name: 'entities.update',
      action: 'edit',
      call: (x) => x.entities.update({ id: parkview.id, name: 'Parkview Ltd' }),
    },
    {
      name: 'entities.archivePreview',
      action: 'delete',
      call: (x) => x.entities.archivePreview({ id: lekki.id }),
    },
    {
      name: 'entities.archive',
      action: 'delete',
      call: (x) => x.entities.archive({ id: lekki.id }),
    },
    { name: 'roles.list', action: 'view', call: (x) => x.roles.list() },
    { name: 'team.list', action: 'view', call: (x) => x.team.list({}) },
    { name: 'checklist.get', action: 'create', call: (x) => x.checklist.get() },
    { name: 'checklist.hide', action: 'create', call: (x) => x.checklist.hide() },
    { name: 'checklist.show', action: 'create', call: (x) => x.checklist.show() },
    {
      name: 'members.updateAccess',
      action: 'edit',
      call: (x) =>
        x.members.updateAccess({ memberId: a.member.id, roleId: viewer, entityIds: null }),
    },
    {
      name: 'members.remove',
      action: 'delete',
      call: (x) => x.members.remove({ memberId: b.member.id }),
    },
    {
      name: 'members.resetTwoStep',
      action: 'edit',
      call: (x) => x.members.resetTwoStep({ memberId: c.member.id }),
    },
    {
      name: 'invitations.create',
      action: 'create',
      call: (x) =>
        x.invitations.create({
          items: [{ email: uniqueEmail(), roleId: viewer }],
          entityIds: null,
        }),
    },
    {
      name: 'invitations.resend',
      action: 'create',
      call: (x) => x.invitations.resend({ id: inv1.invitation.id }),
    },
    {
      name: 'invitations.withdraw',
      action: 'delete',
      call: (x) => x.invitations.withdraw({ id: inv2.invitation.id }),
    },
  ]
  return { client: clientAs(tx, actor.user).client, cases }
}

async function outcome(call: () => Promise<unknown>): Promise<'allowed' | 'denied'> {
  try {
    await call()
    return 'allowed'
  } catch (error) {
    const e = error as { code?: string; data?: { reason?: string } }
    if (e.code === 'FORBIDDEN' && e.data?.reason === 'permission') return 'denied'
    throw error
  }
}

describe('permissions matrix: the default role table is the expected result', () => {
  it.each(SYSTEM_ROLE_KEYS)('%s', (role) =>
    withRollback(async (tx) => {
      const { client, cases } = await world(tx, role)
      for (const c of cases) {
        const expected =
          c.action === 'member' || defaultRoleAllows(role, 'settings', c.action)
            ? 'allowed'
            : 'denied'
        expect({ procedure: c.name, result: await outcome(() => c.call(client)) }).toEqual({
          procedure: c.name,
          result: expected,
        })
      }
    }),
  )

  it('names the roles and a person who can grant it', () =>
    withRollback(async (tx) => {
      const { client } = await world(tx, 'viewer')
      await expect(
        client.invitations.create({
          items: [{ email: uniqueEmail(), roleId: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f' }],
          entityIds: null,
        }),
      ).rejects.toMatchObject({
        message: 'Only owners and admins can invite people. Ask Olumide Bankole (owner).',
        data: { reason: 'permission', askName: 'Olumide Bankole', askRole: 'owner' },
      })
    }))
})
