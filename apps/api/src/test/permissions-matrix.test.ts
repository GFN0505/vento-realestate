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
  createParcel,
  createReadyFile,
  createTitleDocument,
  type TestOrg,
  type TestUser,
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

type LandCase = { name: string; action: PermissionAction; call: (c: Client) => Promise<unknown> }

/**
 * A parcel per changing call (so one call never spoils the next), under Parkview, and the
 * cases every land procedure takes. Files are uploaded by the caller, as attaching requires.
 */
async function landWorld(tx: DbOrTx, org: TestOrg, actor: TestUser, entityId: string) {
  const { client, storage } = clientAs(tx, actor)
  const file = async () => (await createReadyFile(tx, org, { uploadedBy: actor, storage })).id
  const parcel = (name: string) => createParcel(tx, org, { entityId, name })
  const viewed = await parcel('Viewed plot')
  const doc = await createTitleDocument(tx, org, viewed, { type: 'survey_plan', storage })
  const staged = await parcel('Staged plot')
  const stage = staged.stageOf('c_of_o')
  const reshaped = await parcel('Reshaped plot')
  const edited = await parcel('Edited plot')
  const archived = await parcel('Archived plot')
  const restored = await createParcel(tx, org, { entityId, name: 'Restored plot', archived: true })
  const vault = await parcel('Vault plot')
  const twice = await createTitleDocument(tx, org, vault, { type: 'family_receipt' })
  const gone = await createTitleDocument(tx, org, vault, {
    type: 'other',
    removedReason: 'Wrong parcel',
  })
  const [createFile, uploadFile] = [await file(), await file()]
  const cases: LandCase[] = [
    { name: 'land.parcels.list', action: 'view', call: (x) => x.land.parcels.list({}) },
    {
      name: 'land.parcels.get',
      action: 'view',
      call: (x) => x.land.parcels.get({ id: viewed.id }),
    },
    {
      name: 'land.parcels.nameTaken',
      action: 'view',
      call: (x) => x.land.parcels.nameTaken({ name: 'Viewed plot' }),
    },
    {
      name: 'land.parcels.activity',
      action: 'view',
      call: (x) => x.land.parcels.activity({ id: viewed.id }),
    },
    {
      name: 'land.documents.versions',
      action: 'view',
      call: (x) => x.land.documents.versions({ documentId: doc.document.id }),
    },
    {
      name: 'land.documents.link',
      action: 'view',
      call: (x) => x.land.documents.link({ versionId: doc.version.id, disposition: 'inline' }),
    },
    { name: 'land.home', action: 'view', call: (x) => x.land.home({}) },
    {
      name: 'land.parcels.create',
      action: 'create',
      call: (x) =>
        x.land.parcels.create({
          name: 'New plot',
          state: 'Lagos',
          lga: 'Epe',
          size: { value: '2', unit: 'ha' },
          entityId,
          documents: [{ fileId: createFile, type: 'survey_plan' }],
        }),
    },
    {
      name: 'land.documents.upload',
      action: 'create',
      call: (x) =>
        x.land.documents.upload({ parcelId: viewed.id, type: 'c_of_o', fileId: uploadFile }),
    },
    {
      name: 'land.parcels.update',
      action: 'edit',
      call: (x) => x.land.parcels.update({ id: edited.id, expectedVersion: 1, notes: 'Fenced' }),
    },
    {
      name: 'land.stages.update',
      action: 'edit',
      call: (x) =>
        x.land.stages.update({
          id: stage.id,
          expectedVersion: 1,
          status: 'submitted',
          on: '2026-11-02',
        }),
    },
    // Undoes the update just above (the caller's own), so it needs that one to have run.
    {
      name: 'land.stages.undo',
      action: 'edit',
      call: (x) => x.land.stages.undo({ id: stage.id, expectedVersion: 2 }),
    },
    {
      name: 'land.stages.set',
      action: 'edit',
      call: (x) =>
        x.land.stages.set({
          parcelId: reshaped.id,
          expectedVersion: 1,
          types: ['survey_plan', 'c_of_o'],
        }),
    },
    {
      name: 'land.parcels.archive',
      action: 'delete',
      call: (x) => x.land.parcels.archive({ id: archived.id }),
    },
    {
      name: 'land.parcels.restore',
      action: 'delete',
      call: (x) => x.land.parcels.restore({ id: restored.id }),
    },
    {
      name: 'land.documents.removeVersion',
      action: 'delete',
      call: (x) =>
        x.land.documents.removeVersion({ versionId: twice.version.id, reason: 'Wrong parcel' }),
    },
    {
      name: 'land.documents.restoreVersion',
      action: 'delete',
      call: (x) => x.land.documents.restoreVersion({ versionId: gone.version.id }),
    },
  ]
  return { client, cases }
}

async function landActor(tx: DbOrTx, role: SystemRoleKey | 'parkview_land_legal') {
  const org = await createOrganization(tx)
  const parkview = await createEntity(tx, org)
  const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
  const actor =
    role === 'owner'
      ? org.owner
      : role === 'parkview_land_legal'
        ? (await createMember(tx, org, { role: 'land_legal', entityIds: [parkview.id] })).user
        : (await createMember(tx, org, { role })).user
  return { org, parkview, lekki, actor }
}

describe('permissions matrix: Land & title', () => {
  it.each(SYSTEM_ROLE_KEYS)('%s', (role) =>
    withRollback(async (tx) => {
      const { org, parkview, actor } = await landActor(tx, role)
      const { client, cases } = await landWorld(tx, org, actor, parkview.id)
      for (const c of cases) {
        const expected = defaultRoleAllows(role, 'land', c.action) ? 'allowed' : 'denied'
        expect({ procedure: c.name, result: await outcome(() => c.call(client)) }).toEqual({
          procedure: c.name,
          result: expected,
        })
      }
    }),
  )

  it('lets Land & legal limited to Parkview do everything there and nothing on Lekki’s parcels', () =>
    withRollback(async (tx) => {
      const { org, parkview, lekki, actor } = await landActor(tx, 'parkview_land_legal')
      const own = await landWorld(tx, org, actor, parkview.id)
      for (const c of own.cases) {
        expect({ procedure: c.name, result: await outcome(() => c.call(own.client)) }).toEqual({
          procedure: c.name,
          result: 'allowed',
        })
      }
      const other = await landWorld(tx, org, actor, lekki.id)
      const listing = new Set(['land.parcels.list', 'land.parcels.nameTaken', 'land.home'])
      for (const c of other.cases.filter((x) => !listing.has(x.name))) {
        await expect(c.call(other.client), c.name).rejects.toMatchObject({ code: 'NOT_FOUND' })
      }
      expect(await other.client.land.parcels.list({ entityId: lekki.id })).toMatchObject({
        total: 0,
      })
    }))
})
