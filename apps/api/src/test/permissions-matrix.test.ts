import {
  defaultRoleAllows,
  type PermissionAction,
  SYSTEM_ROLE_KEYS,
  type SystemRoleKey,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { uniqueEmail, withRollback } from './db'
import {
  archiveEntityRow,
  createCustomRole,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
} from './factories'
import { clientAs } from './router-client'

type Client = ReturnType<typeof clientAs>['client']
type Case = {
  name: string
  action: PermissionAction | 'member'
  /** Organization-wide: needs access to every company too (brick 3c). */
  allEntities?: boolean
  call: (c: Client) => Promise<unknown>
}

/** Who calls: a built-in role, an admin limited to Parkview, or a Settings: View-only role. */
type Actor = SystemRoleKey | 'parkview_admin' | 'settings_view_only'

/** Builds an organization with something to act on for every Settings procedure. */
async function world(tx: DbOrTx, who: Actor) {
  const org = await createOrganization(tx)
  const parkview = await createEntity(tx, org)
  const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
  const old = await archiveEntityRow(tx, await createEntity(tx, org, { name: 'Ikoyi Crest Ltd' }))
  const siteEngineer = await createCustomRole(tx, org, { permissions: { projects: ['view'] } })
  const auditor = await createCustomRole(tx, org, {
    name: 'Auditor',
    permissions: { land: ['view'], settings: ['view'] },
  })
  const actor =
    who === 'owner'
      ? { user: org.owner }
      : who === 'parkview_admin'
        ? await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
        : who === 'settings_view_only'
          ? await createMember(tx, org, { role: 'viewer', roleId: auditor.id })
          : await createMember(tx, org, { role: who })
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
      allEntities: true,
      call: (x) => x.organization.update({ name: 'Vento Homes Ltd' }),
    },
    {
      name: 'entities.create',
      action: 'create',
      allEntities: true,
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
      allEntities: true,
      call: (x) => x.entities.archivePreview({ id: lekki.id }),
    },
    {
      name: 'entities.archive',
      action: 'delete',
      allEntities: true,
      call: (x) => x.entities.archive({ id: lekki.id }),
    },
    {
      name: 'entities.restore',
      action: 'delete',
      allEntities: true,
      call: (x) => x.entities.restore({ id: old.id }),
    },
    { name: 'roles.list', action: 'view', call: (x) => x.roles.list() },
    { name: 'roles.get', action: 'view', call: (x) => x.roles.get({ id: siteEngineer.id }) },
    {
      name: 'roles.create',
      action: 'create',
      allEntities: true,
      call: (x) => x.roles.create({ name: 'New role', sourceRoleId: viewer }),
    },
    {
      name: 'roles.update',
      action: 'edit',
      allEntities: true,
      call: (x) => x.roles.update({ id: siteEngineer.id, version: 1, description: 'On site' }),
    },
    {
      name: 'roles.delete',
      action: 'delete',
      allEntities: true,
      call: (x) => x.roles.delete({ id: siteEngineer.id }),
    },
    {
      name: 'checklist.answerSingleCompany',
      action: 'create',
      allEntities: true,
      call: (x) => x.checklist.answerSingleCompany({ singleCompany: true }),
    },
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
    // Brick 4. Changing rules is owners-only on top of Settings edit (approval-rules tests).
    { name: 'approvals.list', action: 'member', call: (x) => x.approvals.list({}) },
    {
      name: 'approvals.preview',
      action: 'edit',
      call: (x) =>
        x.approvals.preview({
          actionKey: 'access.role.update',
          subject: { type: 'role', id: siteEngineer.id },
        }),
    },
    { name: 'approvalRules.list', action: 'view', call: (x) => x.approvalRules.list() },
    {
      name: 'audit.list',
      action: 'edit',
      allEntities: true,
      call: (x) => x.audit.list({ from: '2026-11-01', to: '2026-11-27' }),
    },
    {
      name: 'audit.people',
      action: 'edit',
      allEntities: true,
      call: (x) => x.audit.people({ from: '2026-11-01', to: '2026-11-27' }),
    },
    {
      name: 'audit.export',
      action: 'edit',
      allEntities: true,
      call: (x) => x.audit.export({ from: '2026-11-01', to: '2026-11-27' }),
    },
  ]
  return { client: clientAs(tx, actor.user).client, cases }
}

async function outcome(call: () => Promise<unknown>): Promise<'allowed' | 'denied'> {
  const result = await reasonOf(call)
  if (result === 'allowed' || result === 'permission')
    return result === 'allowed' ? result : 'denied'
  throw new Error(`Unexpected refusal: ${result}`)
}

/** 'allowed', or the FORBIDDEN reason; anything else is a broken test world. */
async function reasonOf(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
    return 'allowed'
  } catch (error) {
    const e = error as { code?: string; data?: { reason?: string } }
    if (e.code === 'FORBIDDEN' && e.data?.reason) return e.data.reason
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

  it('refuses an admin limited to Parkview exactly the organization-wide changes', () =>
    withRollback(async (tx) => {
      const { client, cases } = await world(tx, 'parkview_admin')
      for (const c of cases) {
        const reason = await reasonOf(() => c.call(client))
        expect({
          procedure: c.name,
          allEntitiesRefused: reason === 'all_entities_required',
        }).toEqual({ procedure: c.name, allEntitiesRefused: Boolean(c.allEntities) })
      }
    }))

  it('lets a Settings: View-only role read everything and change nothing', () =>
    withRollback(async (tx) => {
      const { client, cases } = await world(tx, 'settings_view_only')
      for (const c of cases) {
        const expected = c.action === 'member' || c.action === 'view' ? 'allowed' : 'denied'
        expect({ procedure: c.name, result: await outcome(() => c.call(client)) }).toEqual({
          procedure: c.name,
          result: expected,
        })
      }
    }))

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
