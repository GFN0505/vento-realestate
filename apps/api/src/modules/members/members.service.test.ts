import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type DbOrTx, db } from '@/db/client'
import { auditEvents, members, platformAdmins, sessions, twoFactors, users } from '@/db/schema'
import { createInvitations } from '@/modules/invitations/invitations.service'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  contextFor,
  createCustomRole,
  createEntity,
  createMember,
  createOfficeManager,
  createOrganization,
  createSession,
  createUser,
  reloadUser,
  type TestOrg,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { removeMember, resetMemberTwoStep, updateMemberAccess } from './members.service'

/**
 * A super-admin who is also a member, as existed before migration 0014. Only inside a rolled-back
 * test transaction: the guards that now forbid it are switched off for the insert.
 */
async function legacySuperAdminMember(tx: DbOrTx, org: TestOrg) {
  const ada = await createUser(tx, { name: 'Ada Okafor', twoFactorEnabled: true })
  // Triggers off for this transaction only (no table lock); the test database role is a superuser.
  await tx.execute(sql`set local session_replication_role = replica`)
  await tx.insert(platformAdmins).values({ userId: ada.id, reason: 'test' })
  await tx.execute(sql`set local session_replication_role = origin`)
  await createMember(tx, org, { role: 'sales', user: ada })
  return ada
}

describe('members', () => {
  it('applies a role change on the very next request', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const aisha = await createMember(tx, org, { role: 'sales', name: 'Aisha Bello' })
      const { client } = clientAs(tx, aisha.user)
      await expect(client.roles.list()).rejects.toMatchObject({ code: 'FORBIDDEN' })
      const result = await updateMemberAccess(await contextFor(tx, org.owner, org), {
        memberId: aisha.member.id,
        roleId: org.roleIds.get('admin') ?? '',
        entityIds: null,
      })
      expect(result.notice).toBe('Aisha Bello is now Admin')
      // Admin requires two-step: the same session is now held at setup until it's on.
      await expect(client.roles.list()).rejects.toMatchObject({
        data: { reason: 'two_step_setup_required' },
      })
      await tx.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, aisha.user.id))
      const { client: again } = clientAs(tx, { ...aisha.user, twoFactorEnabled: true })
      expect((await again.roles.list()).total).toBe(9)
    }))

  it('records role and entity limits before and after', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const kunle = await createMember(tx, org, { role: 'project_manager' })
      await updateMemberAccess(await contextFor(tx, org.owner, org), {
        memberId: kunle.member.id,
        roleId: org.roleIds.get('project_manager') ?? '',
        entityIds: [parkview.id],
      })
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'member.access_changed'),
          ),
        )
      expect(event?.before).toEqual({ role: 'Project manager', entities: 'all' })
      expect(event?.after).toEqual({
        role: 'Project manager',
        entities: ['Parkview Residences SPV Ltd'],
      })
    }))

  it("won't let anyone change their own access", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const admin = await createMember(tx, org, { role: 'admin' })
      await expect(
        updateMemberAccess(await contextFor(tx, admin.user, org), {
          memberId: admin.member.id,
          roleId: org.roleIds.get('owner') ?? '',
          entityIds: null,
        }),
      ).rejects.toMatchObject({
        message: "You can't change your own access. Ask another owner or admin.",
        data: { reason: 'own_access' },
      })
    }))

  it('keeps owner changes to owners', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const admin = await createMember(tx, org, { role: 'admin' })
      const sales = await createMember(tx, org, { role: 'sales' })
      const ctx = await contextFor(tx, admin.user, org)
      const promote = {
        memberId: sales.member.id,
        roleId: org.roleIds.get('owner') ?? '',
        entityIds: null,
      }
      await expect(updateMemberAccess(ctx, promote)).rejects.toMatchObject({
        data: { reason: 'owner_only' },
      })
      await expect(removeMember(ctx, org.ownerMemberId)).rejects.toMatchObject({
        data: { reason: 'owner_only' },
      })
    }))

  it('refuses an owner removed meanwhile, so the last owner stays', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const second = await createMember(tx, org, { role: 'owner' })
      // Both load their access, then each tries to remove the other.
      const firstCtx = await contextFor(tx, org.owner, org)
      const secondCtx = await contextFor(tx, second.user, org)
      await removeMember(firstCtx, second.member.id)
      // The second owner's access is re-read inside the write: they're gone, so refused first.
      await expect(removeMember(secondCtx, org.ownerMemberId)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Your access has changed. Reload the page to continue.',
        data: { reason: 'access_changed' },
      })
    }))

  it('refuses to demote the last owner, by someone removed meanwhile', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const second = await createMember(tx, org, { role: 'owner' })
      const secondCtx = await contextFor(tx, second.user, org)
      await removeMember(await contextFor(tx, org.owner, org), second.member.id)
      await expect(
        updateMemberAccess(secondCtx, {
          memberId: org.ownerMemberId,
          roleId: org.roleIds.get('viewer') ?? '',
          entityIds: null,
        }),
      ).rejects.toMatchObject({ data: { reason: 'access_changed' } })
    }))

  it('backs up the last-owner rule in the database itself', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await expect(
        tx.transaction(async (inner) => {
          // Check now instead of at commit, so the raw update is refused on the spot.
          await inner.execute(sql`set constraints members_keep_an_owner immediate`)
          await inner
            .update(members)
            .set({ status: 'removed', removedAt: new Date() })
            .where(eq(members.id, org.ownerMemberId))
        }),
      ).rejects.toMatchObject({
        cause: { code: '23514', message: expect.stringMatching(/needs at least one owner/) },
      })
    }))

  it('removes a member: status removed, their sessions here end, history stays, re-invite works', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const aisha = await createMember(tx, org, { role: 'finance', name: 'Aisha Bello' })
      await createSession(tx, aisha.user, { activeOrganizationId: org.id })
      const ctx = await contextFor(tx, org.owner, org)
      expect(await removeMember(ctx, aisha.member.id)).toEqual({
        notice: 'Aisha Bello removed. History kept.',
      })
      const [row] = await tx.select().from(members).where(eq(members.id, aisha.member.id))
      expect(row?.status).toBe('removed')
      expect(
        await tx.select().from(sessions).where(eq(sessions.userId, aisha.user.id)),
      ).toHaveLength(0)
      const actions = (
        await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, org.id))
      ).map((e) => e.action)
      expect(actions).toEqual(
        expect.arrayContaining(['member.removed', 'session.revoked_by_removal']),
      )
      const again = await createInvitations(ctx, {
        items: [{ email: aisha.user.email, roleId: org.roleIds.get('finance') ?? '' }],
        entityIds: null,
      })
      expect(again.sent).toBe(1)
    }))

  it('resets two-step: ends every session and blocks sign-in until a new password is set', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const aisha = await createMember(tx, org, { role: 'finance' })
      await tx.insert(twoFactors).values({ userId: aisha.user.id, secret: 's', backupCodes: 'b' })
      const elsewhere = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      await createSession(tx, aisha.user, { activeOrganizationId: elsewhere.id })
      const admin = await createMember(tx, org, { role: 'admin', name: 'Kemi Admin' })
      const result = await resetMemberTwoStep(
        await contextFor(tx, admin.user, org),
        aisha.member.id,
      )
      expect(result.resetPasswordFor).toBe(aisha.user.email)
      expect(result.emails[0]?.subject).toBe('Vento: your two-step sign-in was reset by Kemi Admin')
      expect(result.emails[0]?.text).toContain(
        "set a new password with the link we've just emailed you",
      )
      expect(await reloadUser(tx, aisha.user.id)).toMatchObject({
        twoFactorEnabled: false,
        twoStepSetupRequired: true,
        passwordResetRequired: true,
      })
      expect(
        await tx.select().from(twoFactors).where(eq(twoFactors.userId, aisha.user.id)),
      ).toHaveLength(0)
      // Sessions in every organization end, not just this one.
      expect(
        await tx.select().from(sessions).where(eq(sessions.userId, aisha.user.id)),
      ).toHaveLength(0)
    }))

  it('emails the reset link after a two-step reset', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const aisha = await createMember(tx, org, { role: 'sales' })
      const requests: unknown[] = []
      const { client } = clientAs(tx, org.owner, {
        authApi: { requestPasswordReset: async (input: never) => requests.push(input) },
      })
      await client.members.resetTwoStep({ memberId: aisha.member.id })
      expect(requests).toEqual([
        { body: { email: aisha.user.email, redirectTo: '/reset-password' } },
      ])
    }))

  // Audit M1: whoever in the organization may reset two-step, a super-admin's stays. Staff can't
  // be members since 0014, so this backstop needs the pre-1b state, built with the guard off.
  it.each(['owner', 'admin'] as const)(
    'refuses a %s resetting a Vento super-admin’s two-step, and changes nothing',
    (role) =>
      withRollback(async (tx) => {
        const org = await createOrganization(tx)
        const resetter = role === 'owner' ? org.owner : (await createMember(tx, org, { role })).user
        const ada = await legacySuperAdminMember(tx, org)
        await tx.insert(twoFactors).values({ userId: ada.id, secret: 'x', backupCodes: 'x' })
        const [member] = await tx.select().from(members).where(eq(members.userId, ada.id))
        const { client } = clientAs(tx, resetter, { activeOrganizationId: org.id })
        await expect(
          client.members.resetTwoStep({ memberId: member?.id ?? '' }),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
          message: 'Vento Real Estate staff reset two-step with Vento Real Estate.',
        })
        expect(
          await tx.select().from(twoFactors).where(eq(twoFactors.userId, ada.id)),
        ).toHaveLength(1)
        const [user] = await tx.select().from(users).where(eq(users.id, ada.id))
        expect(user?.twoFactorEnabled).toBe(true)
      }),
  )

  it('keeps a limited admin within their own entities when changing access', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const victoria = await createEntity(tx, org, { name: 'Victoria Gardens Dev. Ltd' })
      const admin = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const kunle = await createMember(tx, org, {
        role: 'project_manager',
        entityIds: [parkview.id],
      })
      const ctx = await contextFor(tx, admin.user, org)
      const change = (entityIds: string[] | null) =>
        updateMemberAccess(ctx, {
          memberId: kunle.member.id,
          roleId: org.roleIds.get('project_manager') ?? '',
          entityIds,
        })
      await expect(change(null)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'entity_limit' },
      })
      await expect(change([parkview.id, victoria.id])).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(change([parkview.id])).resolves.toMatchObject({
        row: {
          access: {
            kind: 'some',
            entities: [{ id: parkview.id, name: 'Parkview Residences SPV Ltd' }],
            hiddenCount: 0,
          },
        },
      })
    }))

  it("lets only owners reset an owner's two-step, and nobody their own", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const admin = await createMember(tx, org, { role: 'admin' })
      await expect(
        resetMemberTwoStep(await contextFor(tx, admin.user, org), org.ownerMemberId),
      ).rejects.toMatchObject({
        data: { reason: 'owner_only' },
      })
      await expect(
        resetMemberTwoStep(await contextFor(tx, org.owner, org), org.ownerMemberId),
      ).rejects.toMatchObject({
        data: { reason: 'own_access' },
      })
    }))
})

describe('members from the Team page', () => {
  it("won't let a limited admin reset or remove someone with wider access", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      const admin = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const aisha = await createMember(tx, org, {
        role: 'finance',
        name: 'Aisha Bello',
        entityIds: [parkview.id, lekki.id],
      })
      const ctx = await contextFor(tx, admin.user, org)
      const refusal = {
        code: 'FORBIDDEN',
        message:
          "Aisha Bello has access to companies you can't see. Ask Olumide Bankole (owner) to change it.",
        data: { reason: 'entity_limit' },
      }
      await expect(resetMemberTwoStep(ctx, aisha.member.id)).rejects.toMatchObject(refusal)
      await expect(removeMember(ctx, aisha.member.id)).rejects.toMatchObject(refusal)
    }))

  it('remembers who removed someone', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const grace = await createMember(tx, org, { role: 'sales' })
      await removeMember(await contextFor(tx, org.owner, org), grace.member.id)
      const [row] = await tx.select().from(members).where(eq(members.id, grace.member.id))
      expect(row?.removedByUserId).toBe(org.owner.id)
    }))

  it('emails every owner, the new one included, when someone is made an owner', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const second = await createMember(tx, org, { role: 'owner', name: 'Ngozi Adeyemi' })
      const aisha = await createMember(tx, org, { role: 'finance', name: 'Aisha Bello' })
      const { client, mailer } = clientAs(tx, org.owner)
      const result = await client.members.updateAccess({
        memberId: aisha.member.id,
        roleId: org.roleIds.get('owner') ?? '',
        entityIds: null,
      })
      expect(result.row).toMatchObject({ id: aisha.member.id, role: { key: 'owner' } })
      const subject = 'Vento: Aisha Bello is now an owner of Vento Homes Ltd'
      for (const person of [org.owner, second.user, aisha.user]) {
        expect(mailer.to(person.email).map((m) => m.subject)).toEqual([subject])
      }
      expect(mailer.to(aisha.user.email)[0]?.text).toMatch(
        /^Olumide Bankole made Aisha Bello an owner of Vento Homes Ltd at \d{2}:\d{2} on /m,
      )
    }))

  it('records an undo as a second access change', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const aisha = await createMember(tx, org, { role: 'finance', name: 'Aisha Bello' })
      const ctx = await contextFor(tx, org.owner, org)
      const change = (role: 'sales' | 'finance') =>
        updateMemberAccess(ctx, {
          memberId: aisha.member.id,
          roleId: org.roleIds.get(role) ?? '',
          entityIds: null,
        })
      expect((await change('sales')).notice).toBe('Aisha Bello is now Sales')
      expect((await change('finance')).row.role.name).toBe('Finance')
      const events = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.targetId, aisha.member.id),
            eq(auditEvents.action, 'member.access_changed'),
          ),
        )
      expect(events.map((e) => e.after)).toEqual([
        { role: 'Sales', entities: 'all' },
        { role: 'Finance', entities: 'all' },
      ])
    }))

  it('refuses access to an archived entity with "no longer available"', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const old = await createEntity(tx, org, { status: 'archived', archivedAt: new Date() })
      const kunle = await createMember(tx, org, { role: 'project_manager' })
      await expect(
        updateMemberAccess(await contextFor(tx, org.owner, org), {
          memberId: kunle.member.id,
          roleId: org.roleIds.get('project_manager') ?? '',
          entityIds: [old.id],
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'entity_unavailable' } })
    }))
})

describe('two owners removing each other at the same moment', () => {
  // Real commits on separate connections: the only way to prove the organization lock
  // serialises them (the test database is recreated each run).
  it('lets one succeed and refuses the other, who is no longer a member', async () => {
    const org = await createOrganization(db, { name: `Owner Race ${uniqueEmail('org')}` })
    const second = await createMember(db, org, { role: 'owner', name: 'Ngozi Adeyemi' })
    // Both loaded their access before either acted, as two open browsers would have.
    const firstCtx = await contextFor(db, org.owner, org)
    const secondCtx = await contextFor(db, second.user, org)

    const results = await Promise.allSettled([
      removeMember(firstCtx, second.member.id),
      removeMember(secondCtx, org.ownerMemberId),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refused = results.find((r) => r.status === 'rejected')
    // Serialised by the organization lock; the loser is re-read inside its write and is gone.
    expect(refused?.status === 'rejected' && refused.reason).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Your access has changed. Reload the page to continue.',
      data: { reason: 'access_changed' },
    })
    const owners = await db
      .select()
      .from(members)
      .where(and(eq(members.organizationId, org.id), eq(members.status, 'active')))
    expect(owners).toHaveLength(1)
  })
})

describe('members: the permission ceiling and custom roles', () => {
  it("won't let an office manager change, reset or remove someone who can do more", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const office = await createOfficeManager(tx, org)
      const kemi = await createMember(tx, org, { role: 'finance', name: 'Kemi Adebayo' })
      const ctx = await contextFor(tx, office.user, org)
      const refused = {
        code: 'FORBIDDEN',
        data: { reason: 'wider_permissions' },
        message: "Kemi Adebayo can do things you can't. Ask Olumide Bankole (owner) to change it.",
      }
      await expect(
        updateMemberAccess(ctx, {
          memberId: kemi.member.id,
          roleId: org.roleIds.get('viewer') ?? '',
          entityIds: null,
        }),
      ).rejects.toMatchObject(refused)
      await expect(resetMemberTwoStep(ctx, kemi.member.id)).rejects.toMatchObject(refused)
      await expect(removeMember(ctx, kemi.member.id)).rejects.toMatchObject(refused)
    }))

  it('lets an office manager give a role within their permissions, never a wider one', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const office = await createOfficeManager(tx, org)
      // Viewer includes Finance: View, which the office manager lacks; a clerk role doesn't.
      const clerk = await createCustomRole(tx, org, {
        name: 'Clerk',
        permissions: { sales: ['view'] },
      })
      const grace = await createMember(tx, org, {
        role: 'sales',
        roleId: clerk.id,
        name: 'Grace Umeh',
      })
      const ctx = await contextFor(tx, office.user, org)
      const give = (key: 'sales' | 'admin') =>
        updateMemberAccess(ctx, {
          memberId: grace.member.id,
          roleId: org.roleIds.get(key) ?? '',
          entityIds: null,
        })
      await expect(give('admin')).rejects.toMatchObject({
        data: { reason: 'wider_permissions' },
        message: 'You can only give access you have yourself.',
      })
      expect((await give('sales')).notice).toBe('Grace Umeh is now Sales')
    }))

  it('gives a custom role, and refuses one deleted meanwhile', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const grace = await createMember(tx, org, { role: 'viewer', name: 'Grace Umeh' })
      const site = await createCustomRole(tx, org, { permissions: { projects: ['view'] } })
      const gone = await createCustomRole(tx, org, {
        name: 'Gone',
        permissions: { projects: ['view'] },
        archivedAt: new Date(),
      })
      const ctx = await contextFor(tx, org.owner, org)
      const give = (roleId: string) =>
        updateMemberAccess(ctx, { memberId: grace.member.id, roleId, entityIds: null })
      expect((await give(site.id)).row.role).toEqual({
        id: site.id,
        key: null,
        name: 'Site engineer',
      })
      await expect(give(gone.id)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'role_unavailable' },
        message: 'That role no longer exists. Choose another.',
      })
    }))
})
