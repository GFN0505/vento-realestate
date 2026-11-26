import { defaultPermissions, defaultRole, MAX_CUSTOM_ROLES, toggleCell } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { loadMembership } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { auditEvents, members, roles } from '@/db/schema'
import { removeMember } from '@/modules/members/members.service'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createCustomRole,
  createEntity,
  createInvitation,
  createMember,
  createOfficeManager,
  createOrganization,
  type TestOrg,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { createRole, deleteRole, getRole, listRoles, updateRole } from './roles.service'

const pm = () => defaultPermissions(defaultRole('project_manager'))

async function events(tx: DbOrTx, org: TestOrg, action: string) {
  return tx
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, action)))
}

/** An owner context and a "Site engineer" made from Project manager. */
async function siteEngineer(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const ctx = await contextFor(tx, org.owner, org)
  const { role } = await createRole(ctx, {
    name: 'Site engineer',
    sourceRoleId: org.roleIds.get('project_manager') ?? '',
  })
  return { org, ctx, role }
}

describe('roles: listing', () => {
  it('lists built-ins in the default order, then custom roles A–Z, with who holds each', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const zed = await createCustomRole(tx, org, {
        name: 'Zed role',
        permissions: { land: ['view'] },
      })
      const auditor = await createCustomRole(tx, org, {
        name: 'auditor',
        permissions: { land: ['view'] },
      })
      await createMember(tx, org, { role: 'sales', roleId: zed.id })
      await createInvitation(tx, org, { role: 'viewer', roleId: zed.id })
      await createInvitation(tx, org, {
        role: 'viewer',
        roleId: zed.id,
        expiresAt: new Date(Date.now() - 3600_000),
      })
      await createInvitation(tx, org, { role: 'viewer', roleId: zed.id, status: 'withdrawn' })
      const list = await listRoles(await contextFor(tx, org.owner, org))
      expect(list.items.map((r) => r.name)).toEqual([
        'Owner',
        'Admin',
        'Land & legal',
        'Project manager',
        'Sales',
        'Finance',
        'HR',
        'Facility',
        'Viewer',
        'auditor',
        'Zed role',
      ])
      expect(list.total).toBe(11)
      const byId = new Map(list.items.map((r) => [r.id, r]))
      expect(byId.get(zed.id)).toMatchObject({ memberCount: 1, invitedCount: 2, version: 1 })
      expect(byId.get(auditor.id)).toMatchObject({ memberCount: 0, invitedCount: 0 })
      expect(list.items[0]).toMatchObject({ key: 'owner', memberCount: 1 })
    }))

  it('shows built-ins exactly as the shared default table, read-only', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const list = await listRoles(await contextFor(tx, org.owner, org))
      for (const role of list.items) {
        const shared = defaultRole(role.key ?? 'viewer')
        expect(role.permissions).toEqual(defaultPermissions(shared))
        expect(role.requiresTwoStep).toBe(shared.requiresTwoStep)
        expect(role.readOnly?.reason).toBe('built_in')
        expect(role.can).toMatchObject({ edit: false, delete: false, duplicate: true })
      }
    }))
})

describe('roles: creating', () => {
  it('copies the source role, says what it is based on, and audits it', () =>
    withRollback(async (tx) => {
      const { org, role } = await siteEngineer(tx)
      expect(role).toMatchObject({
        key: null,
        isSystem: false,
        name: 'Site engineer',
        pluralName: 'people with the Site engineer role',
        description: 'Based on Project manager',
        requiresTwoStep: false,
        permissions: pm(),
        version: 1,
        memberCount: 0,
        can: { edit: true, delete: true, duplicate: true, assign: true },
        readOnly: null,
      })
      const [event] = await events(tx, org, 'role.created')
      expect(event?.after).toMatchObject({ name: 'Site engineer', source: 'Project manager' })
    }))

  it('keeps two-step on when copying Finance', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ctx = await contextFor(tx, org.owner, org)
      const { role } = await createRole(ctx, {
        name: 'Finance lead',
        sourceRoleId: org.roleIds.get('finance') ?? '',
      })
      expect(role.requiresTwoStep).toBe(true)
    }))

  it('refuses a name any live role has, in any case, built-ins included', () =>
    withRollback(async (tx) => {
      const { org, ctx } = await siteEngineer(tx)
      const sourceRoleId = org.roleIds.get('viewer') ?? ''
      for (const name of ['SITE ENGINEER', 'sales']) {
        await expect(createRole(ctx, { name, sourceRoleId })).rejects.toMatchObject({
          code: 'CONFLICT',
          data: { reason: 'role_name_taken' },
          message: `A role called ${name} already exists.`,
        })
      }
    }))

  it('lets the name of a deleted role kept for history be used again', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createCustomRole(tx, org, {
        name: 'Site engineer',
        permissions: { land: ['view'] },
        archivedAt: new Date(),
      })
      const ctx = await contextFor(tx, org.owner, org)
      const { role } = await createRole(ctx, {
        name: 'Site engineer',
        sourceRoleId: org.roleIds.get('viewer') ?? '',
      })
      expect(role.name).toBe('Site engineer')
    }))

  it(`stops at ${MAX_CUSTOM_ROLES} custom roles`, () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      for (let i = 0; i < MAX_CUSTOM_ROLES; i++) {
        await createCustomRole(tx, org, { name: `Role ${i}`, permissions: { land: ['view'] } })
      }
      const ctx = await contextFor(tx, org.owner, org)
      await expect(
        createRole(ctx, { name: 'One too many', sourceRoleId: org.roleIds.get('viewer') ?? '' }),
      ).rejects.toMatchObject({
        data: { reason: 'role_limit' },
        message: 'You can have up to 50 custom roles. Delete one you no longer use.',
      })
    }))

  it('refuses to copy a role wider than the creator, and a source from another organization', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const office = await createOfficeManager(tx, org)
      const ctx = await contextFor(tx, office.user, org)
      await expect(
        createRole(ctx, { name: 'Copy of Admin', sourceRoleId: org.roleIds.get('admin') ?? '' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'wider_permissions' } })
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await expect(
        createRole(ctx, { name: 'Copy', sourceRoleId: theirs.roleIds.get('viewer') ?? '' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))
})

describe('roles: saving', () => {
  it('replaces the permissions, bumps the version and audits each module’s change', () =>
    withRollback(async (tx) => {
      const { org, ctx, role } = await siteEngineer(tx)
      let next = toggleCell(role.permissions, 'sales', 'view', false)
      next = toggleCell(next, 'land', 'view', false)
      next = toggleCell(next, 'documents', 'create', true)
      const saved = await updateRole(ctx, { id: role.id, version: 1, permissions: next })
      expect(saved.notice).toBe('Site engineer saved')
      expect(saved.role).toMatchObject({ version: 2, permissions: next })
      const [event] = await events(tx, org, 'role.updated')
      expect(event?.before).toEqual({
        permissions: { land: ['view'], sales: ['view'], documents: ['view'] },
      })
      expect(event?.after).toEqual({
        permissions: { land: [], sales: [], documents: ['view', 'create'] },
      })
    }))

  it('refuses a stale version, naming who saved last, and Undo with the new version works', () =>
    withRollback(async (tx) => {
      const { org, role } = await siteEngineer(tx)
      const aisha = await createMember(tx, org, { role: 'admin', name: 'Aisha Bello' })
      const aishaCtx = await contextFor(tx, aisha.user, org)
      await updateRole(aishaCtx, { id: role.id, version: 1, name: 'Site lead' })
      const ctx = await contextFor(tx, org.owner, org)
      await expect(
        updateRole(ctx, { id: role.id, version: 1, description: 'Mine' }),
      ).rejects.toMatchObject({
        data: { reason: 'role_changed', changedByName: 'Aisha Bello' },
        message:
          'Aisha Bello changed Site lead a moment ago. Reload to see the latest, then make your change again.',
      })
      const undone = await updateRole(aishaCtx, { id: role.id, version: 2, name: 'Site engineer' })
      expect(undone.role).toMatchObject({ name: 'Site engineer', version: 3 })
      expect(await events(tx, org, 'role.updated')).toHaveLength(2)
    }))

  it('refuses to turn two-step off for a role that can edit in Finance', () =>
    withRollback(async (tx) => {
      const { ctx, role } = await siteEngineer(tx)
      const finance = toggleCell(role.permissions, 'finance', 'edit', true)
      await expect(
        updateRole(ctx, { id: role.id, version: 1, permissions: finance }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'role_needs_two_step' },
        message:
          "This role needs two-step sign-in because it can manage money, payroll or people's access.",
      })
      const saved = await updateRole(ctx, {
        id: role.id,
        version: 1,
        permissions: finance,
        requiresTwoStep: true,
      })
      expect(saved.role.requiresTwoStep).toBe(true)
    }))

  it('refuses built-in roles and the role you hold', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const office = await createOfficeManager(tx, org)
      const owner = await contextFor(tx, org.owner, org)
      await expect(
        updateRole(owner, { id: org.roleIds.get('sales') ?? '', version: 1, name: 'Sellers' }),
      ).rejects.toMatchObject({ data: { reason: 'built_in_role' } })
      const own = await contextFor(tx, office.user, org)
      await expect(
        updateRole(own, { id: office.role.id, version: 1, name: 'Boss' }),
      ).rejects.toMatchObject({
        data: { reason: 'own_role' },
        message: 'You have this role. Ask another owner or admin to change it.',
      })
    }))

  it('keeps an office manager within their own permissions', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const office = await createOfficeManager(tx, org)
      const ctx = await contextFor(tx, office.user, org)
      const lead = await createCustomRole(tx, org, {
        name: 'Finance lead',
        permissions: defaultPermissions(defaultRole('finance')),
        requiresTwoStep: true,
      })
      await expect(
        updateRole(ctx, { id: lead.id, version: 1, name: 'Money' }),
      ).rejects.toMatchObject({
        data: { reason: 'wider_permissions' },
        message: "Finance lead can do things you can't. Ask Olumide Bankole (owner) to change it.",
      })
      const clerk = await createCustomRole(tx, org, {
        name: 'Clerk',
        permissions: { sales: ['view'] },
      })
      const withFinance = toggleCell(
        defaultPermissions(defaultRole('viewer')),
        'finance',
        'view',
        true,
      )
      await expect(
        updateRole(ctx, { id: clerk.id, version: 1, permissions: withFinance }),
      ).rejects.toMatchObject({
        data: { reason: 'wider_permissions' },
        message: 'You can only give access you have yourself.',
      })
    }))

  it('refuses an admin limited to one company, through the router', () =>
    withRollback(async (tx) => {
      const { org, role } = await siteEngineer(tx)
      const parkview = await createEntity(tx, org)
      const limited = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const { client } = clientAs(tx, limited.user)
      await expect(
        client.roles.update({ id: role.id, version: 1, name: 'Mine' }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'all_entities_required', askName: 'Olumide Bankole' },
        message:
          'Only people with access to every company can change this. Ask Olumide Bankole (owner).',
      })
      const seen = await client.roles.get({ id: role.id })
      expect(seen.readOnly?.reason).toBe('all_entities')
    }))

  it("applies to holders on their next request, and sends them to two-step when it's newly required", () =>
    withRollback(async (tx) => {
      const { org, ctx, role } = await siteEngineer(tx)
      const emeka = await createMember(tx, org, { role: 'viewer', roleId: role.id })
      const before = await loadMembership(tx, emeka.user.id, org.id)
      expect(before?.member.permissions.finance).toEqual([])
      const finance = toggleCell(role.permissions, 'finance', 'edit', true)
      await updateRole(ctx, {
        id: role.id,
        version: 1,
        permissions: finance,
        requiresTwoStep: true,
      })
      const after = await loadMembership(tx, emeka.user.id, org.id)
      expect(after?.member.permissions.finance).toEqual(['view', 'edit'])
      await expect(clientAs(tx, emeka.user).client.entities.list({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'two_step_setup_required' },
      })
    }))
})

describe('roles: deleting', () => {
  it('refuses while anyone holds it, counting open invitations', () =>
    withRollback(async (tx) => {
      const { org, ctx, role } = await siteEngineer(tx)
      await createMember(tx, org, { role: 'viewer', roleId: role.id })
      await createMember(tx, org, { role: 'viewer', roleId: role.id })
      await createInvitation(tx, org, { role: 'viewer', roleId: role.id })
      await expect(deleteRole(ctx, role.id)).rejects.toMatchObject({
        data: { reason: 'role_in_use', holders: { members: 2, invited: 1 } },
        message:
          'Move 3 people to another role first. Site engineer can only be deleted when nobody has it.',
      })
    }))

  it('erases a role nothing refers to', () =>
    withRollback(async (tx) => {
      const { org, ctx, role } = await siteEngineer(tx)
      expect(await deleteRole(ctx, role.id)).toEqual({ notice: 'Site engineer deleted' })
      expect(await tx.select().from(roles).where(eq(roles.id, role.id))).toEqual([])
      const [event] = await events(tx, org, 'role.deleted')
      expect(event?.metadata).toEqual({ kept: 'erased' })
    }))

  it('keeps a role history refers to, hidden: gone from the list and not found', () =>
    withRollback(async (tx) => {
      const { org, ctx, role } = await siteEngineer(tx)
      const emeka = await createMember(tx, org, { role: 'viewer', roleId: role.id })
      await removeMember(ctx, emeka.member.id)
      await deleteRole(ctx, role.id)
      const [row] = await tx.select().from(roles).where(eq(roles.id, role.id))
      expect(row?.archivedAt).not.toBeNull()
      expect((await listRoles(ctx)).items.map((r) => r.id)).not.toContain(role.id)
      await expect(getRole(ctx, role.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(deleteRole(ctx, role.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('never deletes a built-in role', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ctx = await contextFor(tx, org.owner, org)
      await expect(deleteRole(ctx, org.roleIds.get('viewer') ?? '')).rejects.toMatchObject({
        data: { reason: 'built_in_role' },
      })
    }))
})

describe('roles: database guards', () => {
  it('refuses an active member on an archived role, even written directly', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const gone = await createCustomRole(tx, org, {
        name: 'Gone',
        permissions: { land: ['view'] },
        archivedAt: new Date(),
      })
      await expect(
        tx.transaction((inner) => createMember(inner, org, { role: 'viewer', roleId: gone.id })),
      ).rejects.toMatchObject({ cause: { constraint: 'members_role_not_archived' } })
    }))

  it('refuses archiving a role someone holds, even written directly', () =>
    withRollback(async (tx) => {
      const { org, role } = await siteEngineer(tx)
      await createMember(tx, org, { role: 'viewer', roleId: role.id })
      await expect(
        tx.transaction((inner) =>
          inner.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, role.id)),
        ),
      ).rejects.toMatchObject({ cause: { constraint: 'roles_archive_unheld' } })
      const [member] = await tx.select().from(members).where(eq(members.roleId, role.id))
      expect(member?.status).toBe('active')
    }))
})
