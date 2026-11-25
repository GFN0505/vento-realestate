import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents, members, sessions, twoFactors, users } from '@/db/schema'
import { createInvitations } from '@/modules/invitations/invitations.service'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createEntity,
  createMember,
  createOrganization,
  createSession,
  reloadUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { removeMember, resetMemberTwoStep, updateMemberAccess } from './members.service'

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

  it('refuses to remove the last owner when two owners act at once', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const second = await createMember(tx, org, { role: 'owner' })
      // Both load their access, then each tries to remove the other.
      const firstCtx = await contextFor(tx, org.owner, org)
      const secondCtx = await contextFor(tx, second.user, org)
      await removeMember(firstCtx, second.member.id)
      await expect(removeMember(secondCtx, org.ownerMemberId)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Vento Homes Ltd needs at least one owner. Make someone else an owner first.',
        data: { reason: 'last_owner' },
      })
    }))

  it('refuses to demote the last owner', () =>
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
      ).rejects.toMatchObject({ data: { reason: 'last_owner' } })
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

  it('keeps a limited admin within their own entities when changing access', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const victoria = await createEntity(tx, org, { name: 'Victoria Gardens Dev. Ltd' })
      const admin = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const kunle = await createMember(tx, org, { role: 'project_manager' })
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
        member: { entities: [{ id: parkview.id, name: 'Parkview Residences SPV Ltd' }] },
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
