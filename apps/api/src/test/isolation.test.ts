import { emptyPermissionSet } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  approvalDecisions,
  approvalRequests,
  approvalRules,
  auditEvents,
  entities,
  invitations,
  members,
  organizations,
  passkeys,
  roles,
  sessions,
  users,
} from '@/db/schema'
import { lagosIsoDate } from '@/lib/format'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { recordAudit } from '@/modules/audit/audit.service'
import { recordDelivery } from '@/modules/invitations/delivery'
import { uniqueSuffix, withRollback } from './db'
import {
  addAddOnRow,
  archiveEntityRow,
  createCustomRole,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
  createSession,
  createSuperAdmin,
  createUser,
  setOverride,
  setStage,
} from './factories'
import { clientAs, consoleClientAs } from './router-client'

describe('organization isolation', () => {
  it('answers not found for every id from another organization and changes nothing', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await createEntity(tx, mine)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const theirEntity = await createEntity(tx, theirs, { name: 'Their SPV Ltd' })
      const theirOther = await createEntity(tx, theirs, { name: 'Their Second SPV Ltd' })
      const theirMember = await createMember(tx, theirs, { role: 'sales' })
      const theirInvitation = await createInvitation(tx, theirs, { role: 'viewer' })
      const theirSession = await createSession(tx, theirMember.user)
      const [theirPasskey] = await tx
        .insert(passkeys)
        .values({
          userId: theirMember.user.id,
          name: 'Their iPhone',
          publicKey: 'x',
          credentialID: `cred-${theirMember.user.id}`,
          counter: 0,
          deviceType: 'multiDevice',
          backedUp: true,
        })
        .returning()
      const myViewerRole = mine.roleIds.get('viewer') ?? ''
      const theirViewerRole = theirs.roleIds.get('viewer') ?? ''
      const myMember = await createMember(tx, mine, { role: 'sales' })
      const { client } = clientAs(tx, mine.owner)

      const attempts: [string, () => Promise<unknown>][] = [
        ['entities.get', () => client.entities.get({ id: theirEntity.id })],
        [
          'entities.update',
          () => client.entities.update({ id: theirEntity.id, name: 'Hacked Ltd' }),
        ],
        ['entities.archivePreview', () => client.entities.archivePreview({ id: theirEntity.id })],
        ['entities.archive', () => client.entities.archive({ id: theirOther.id })],
        [
          'members.updateAccess (their member)',
          () =>
            client.members.updateAccess({
              memberId: theirMember.member.id,
              roleId: myViewerRole,
              entityIds: null,
            }),
        ],
        [
          'members.updateAccess (their role)',
          () =>
            client.members.updateAccess({
              memberId: myMember.member.id,
              roleId: theirViewerRole,
              entityIds: null,
            }),
        ],
        [
          'members.updateAccess (their entity)',
          () =>
            client.members.updateAccess({
              memberId: myMember.member.id,
              roleId: myViewerRole,
              entityIds: [theirEntity.id],
            }),
        ],
        ['members.remove', () => client.members.remove({ memberId: theirMember.member.id })],
        [
          'members.resetTwoStep',
          () => client.members.resetTwoStep({ memberId: theirMember.member.id }),
        ],
        [
          'invitations.create (their role)',
          () =>
            client.invitations.create({
              items: [{ email: 'x@test.vento.ng', roleId: theirViewerRole }],
              entityIds: null,
            }),
        ],
        [
          'invitations.create (their entity)',
          () =>
            client.invitations.create({
              items: [{ email: 'x@test.vento.ng', roleId: myViewerRole }],
              entityIds: [theirEntity.id],
            }),
        ],
        [
          'invitations.resend',
          () => client.invitations.resend({ id: theirInvitation.invitation.id }),
        ],
        [
          'invitations.withdraw',
          () => client.invitations.withdraw({ id: theirInvitation.invitation.id }),
        ],
        ['account.sessions.revoke', () => client.account.sessions.revoke({ id: theirSession.id })],
        [
          'account.passkeys.rename',
          () => client.account.passkeys.rename({ id: theirPasskey?.id ?? '', name: 'Mine now' }),
        ],
        [
          'account.passkeys.remove',
          () => client.account.passkeys.remove({ id: theirPasskey?.id ?? '' }),
        ],
      ]
      // A role id that isn't this organization's live role answers role_unavailable, the same as
      // one deleted a moment ago: one generic answer that says nothing about other organizations.
      for (const [name, attempt] of attempts) {
        const expected = /\(their (custom )?role\)/.test(name)
          ? { code: 'CONFLICT', data: { reason: 'role_unavailable' } }
          : { code: 'NOT_FOUND' }
        await expect(attempt(), name).rejects.toMatchObject(expected)
      }

      const [entity] = await tx.select().from(entities).where(eq(entities.id, theirEntity.id))
      expect(entity?.name).toBe('Their SPV Ltd')
      expect(
        (await tx.select().from(entities).where(eq(entities.id, theirOther.id)))[0]?.status,
      ).toBe('active')
      expect(
        (await tx.select().from(members).where(eq(members.id, theirMember.member.id)))[0]?.status,
      ).toBe('active')
      expect(
        (
          await tx
            .select()
            .from(invitations)
            .where(eq(invitations.id, theirInvitation.invitation.id))
        )[0]?.status,
      ).toBe('pending')
      expect(await tx.select().from(sessions).where(eq(sessions.id, theirSession.id))).toHaveLength(
        1,
      )
      expect(
        (
          await tx
            .select()
            .from(passkeys)
            .where(eq(passkeys.id, theirPasskey?.id ?? ''))
        )[0]?.name,
      ).toBe('Their iPhone')
      expect(
        (await tx.select().from(users).where(eq(users.id, theirMember.user.id)))[0]
          ?.twoStepSetupRequired,
      ).toBe(false)
    }))

  it("lists only this organization's rows", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await createEntity(tx, mine, { name: 'Mine Ltd' })
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createEntity(tx, theirs, { name: 'Theirs Ltd' })
      await createInvitation(tx, theirs, { role: 'viewer' })
      const { client } = clientAs(tx, mine.owner)
      expect((await client.entities.list({})).items.map((e) => e.name)).toEqual(['Mine Ltd'])
      const team = await client.team.list({})
      expect(team.total).toBe(1)
      expect(team.counts).toEqual({ members: 1, invited: 0, removed: 0 })
      expect((await client.team.list({ show: 'invited' })).total).toBe(0)
      expect((await client.roles.list()).total).toBe(9)
    }))

  it('lists no team rows for a role from another organization, and never their people', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createMember(tx, theirs, { role: 'sales', name: 'Their Sales Person' })
      await createInvitation(tx, theirs, { role: 'sales' })
      const { client } = clientAs(tx, mine.owner)
      const foreignRole = await client.team.list({ roleId: theirs.roleIds.get('sales') ?? '' })
      expect(foreignRole.items).toEqual([])
      const all = await client.team.list({})
      expect(all.items.map((r) => r.id)).toEqual([mine.ownerMemberId])
      expect(JSON.stringify(all)).not.toContain('Their Sales Person')
    }))

  it("ticks the checklist only from this organization's people and entities", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createEntity(tx, theirs)
      await createMember(tx, theirs, { role: 'sales' })
      await createInvitation(tx, theirs, { role: 'sales' })
      const { client } = clientAs(tx, mine.owner)
      const { items } = await client.checklist.get()
      expect(items.filter((i) => !i.done).map((i) => i.key)).toEqual([
        'first_entity',
        'other_companies',
        'invite_team',
      ])
    }))

  it("records no delivery on another organization's invitation", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const { invitation } = await createInvitation(tx, theirs, {
        role: 'sales',
        delivery: 'queued',
      })
      const recorded = await recordDelivery(tx, {
        organizationId: mine.id,
        invitationId: invitation.id,
        sentAt: invitation.lastSentAt,
        result: { status: 'failed', kind: 'rejected' },
      })
      expect(recorded).toBeNull()
      const [row] = await tx.select().from(invitations).where(eq(invitations.id, invitation.id))
      expect(row?.delivery).toBe('queued')
    }))

  it('refuses to switch to another organization and leaves the session where it was', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const session = await createSession(tx, mine.owner, { activeOrganizationId: mine.id })
      const { client } = clientAs(tx, mine.owner, {
        sessionId: session.id,
        activeOrganizationId: mine.id,
      })
      await expect(
        client.account.switchOrganization({ organizationId: theirs.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.activeOrganizationId).toBe(mine.id)
      expect(
        (await tx.select().from(users).where(eq(users.id, mine.owner.id)))[0]
          ?.lastActiveOrganizationId,
      ).toBeNull()
    }))

  it('names only people from this organization as access contacts', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const grace = await createMember(tx, mine, { role: 'sales', name: 'Grace Umeh' })
      const theirOwner = await createUser(tx, { name: 'Their Owner', twoFactorEnabled: true })
      const theirs = await createOrganization(tx, {
        name: 'Other Developer Ltd',
        owner: theirOwner,
      })
      await createMember(tx, theirs, { role: 'admin', name: 'Their Admin' })
      const { client } = clientAs(tx, grace.user, { activeOrganizationId: mine.id })
      const result = await client.access.whoCanChangeAccess({ module: 'settings' })
      expect(result.contacts).toEqual([{ name: 'Olumide Bankole', roleName: 'Owner' }])
      expect(JSON.stringify(result)).not.toMatch(/Their (Owner|Admin)/)
    }))

  it('never reads the organization from input', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const { client } = clientAs(tx, mine.owner)
      const sneaky = {
        name: 'Sneaky Ltd',
        type: 'spv',
        organizationId: theirs.id,
      } as unknown as Parameters<typeof client.entities.create>[0]
      await expect(client.entities.create(sneaky)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }))
})

describe('organization isolation: roles and companies (brick 3c)', () => {
  it('answers not found for their roles and companies, changing and auditing nothing', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await createEntity(tx, mine)
      const myMember = await createMember(tx, mine, { role: 'sales' })
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createEntity(tx, theirs, { name: 'Their Holding Ltd' })
      const theirOld = await archiveEntityRow(
        tx,
        await createEntity(tx, theirs, { name: 'Their Old SPV Ltd' }),
      )
      const theirRole = await createCustomRole(tx, theirs, {
        name: 'Their engineer',
        permissions: { projects: ['view'] },
      })
      const { client } = clientAs(tx, mine.owner)
      const attempts: [string, () => Promise<unknown>][] = [
        ['roles.get', () => client.roles.get({ id: theirRole.id })],
        [
          'roles.update',
          () => client.roles.update({ id: theirRole.id, version: 1, name: 'Mine now' }),
        ],
        ['roles.delete', () => client.roles.delete({ id: theirRole.id })],
        [
          'roles.create (their source)',
          () => client.roles.create({ name: 'Copy', sourceRoleId: theirRole.id }),
        ],
        ['entities.restore', () => client.entities.restore({ id: theirOld.id })],
        ['entities.update (archived)', () => client.entities.update({ id: theirOld.id, tin: '1' })],
        ['entities.archivePreview', () => client.entities.archivePreview({ id: theirOld.id })],
        [
          'members.updateAccess (their custom role)',
          () =>
            client.members.updateAccess({
              memberId: myMember.member.id,
              roleId: theirRole.id,
              entityIds: null,
            }),
        ],
        [
          'invitations.create (their custom role)',
          () =>
            client.invitations.create({
              items: [{ email: 'x@test.vento.ng', roleId: theirRole.id }],
              entityIds: null,
            }),
        ],
      ]
      // A role id that isn't this organization's live role answers role_unavailable, the same as
      // one deleted a moment ago: one generic answer that says nothing about other organizations.
      for (const [name, attempt] of attempts) {
        const expected = /\(their (custom )?role\)/.test(name)
          ? { code: 'CONFLICT', data: { reason: 'role_unavailable' } }
          : { code: 'NOT_FOUND' }
        await expect(attempt(), name).rejects.toMatchObject(expected)
      }
      const [role] = await tx.select().from(roles).where(eq(roles.id, theirRole.id))
      expect(role).toMatchObject({ name: 'Their engineer', version: 1, archivedAt: null })
      const [old] = await tx.select().from(entities).where(eq(entities.id, theirOld.id))
      expect(old?.status).toBe('archived')
      expect(
        await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, theirs.id)),
      ).toEqual([])
      const mineAudit = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.organizationId, mine.id))
      expect(mineAudit).toEqual([])
    }))

  it("never lists or counts another organization's roles, holders or companies", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await createEntity(tx, mine, { name: 'Mine Ltd' })
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createEntity(tx, theirs, { name: 'Parkview Theirs Ltd', rcNumber: 'RC 999' })
      await createCustomRole(tx, theirs, { permissions: { projects: ['view'] } })
      await createMember(tx, theirs, { role: 'viewer' })
      const { client } = clientAs(tx, mine.owner)
      const list = await client.roles.list()
      expect(list.total).toBe(9)
      expect(list.items.find((r) => r.key === 'viewer')?.memberCount).toBe(0)
      expect(list.items.find((r) => r.key === 'owner')?.memberCount).toBe(1)
      const search = await client.entities.list({ q: 'Theirs' })
      expect(search).toMatchObject({ items: [], total: 0 })
      expect((await client.entities.list({ q: 'RC 999' })).items).toEqual([])
    }))

  it('records the one-company answer on this organization only', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await clientAs(tx, mine.owner).client.checklist.answerSingleCompany({ singleCompany: true })
      const answered = async (id: string) =>
        (await tx.select().from(organizations).where(eq(organizations.id, id)))[0]
          ?.singleCompanyConfirmedAt ?? null
      expect(await answered(mine.id)).not.toBeNull()
      expect(await answered(theirs.id)).toBeNull()
    }))
})

describe('feature and plan isolation', () => {
  it("never lets one organization's overrides, add-ons or deals reach another", () =>
    withRollback(async (tx) => {
      const a = await createOrganization(tx, { name: 'Org A Ltd', planKey: 'starter' })
      const b = await createOrganization(tx, { name: 'Org B Ltd', planKey: 'starter' })
      await setStage(tx, 'land', 'on')
      await setOverride(tx, a, { kind: 'release', key: 'sales.commissions', enabled: true })
      await setOverride(tx, a, { kind: 'feature', key: 'facility', enabled: true })
      await setOverride(tx, a, { kind: 'release', key: 'facility', enabled: true })
      await setOverride(tx, a, { kind: 'limit', key: 'entities', limitValue: null })
      await addAddOnRow(tx, a)
      await createEntity(tx, b, { name: 'B Holding Ltd', type: 'holding' })
      await createEntity(tx, b, { name: 'B SPV Ltd' })

      const { client } = clientAs(tx, b.owner, { activeOrganizationId: b.id })
      const me = await client.account.me()
      expect(me.features).toEqual([{ key: 'land', earlyAccess: false }])
      expect(me.plan).toMatchObject({ aiBudget: null, upgradeHints: [] })
      await expect(
        client.entities.create({ name: 'B Third Ltd', type: 'spv' }),
      ).rejects.toMatchObject({ data: { reason: 'plan_limit' } })
    }))

  it("gives a person B's features, not internal A's, after switching to B", () =>
    withRollback(async (tx) => {
      const person = await createUser(tx, { name: 'Bisi Lawal', twoFactorEnabled: true })
      const a = await createOrganization(tx, { name: 'Vento Demo Ltd', owner: person })
      const b = await createOrganization(tx, {
        name: 'Lekki Partners Ltd',
        owner: person,
        planKey: 'starter',
      })
      const session = await createSession(tx, person, { activeOrganizationId: a.id })
      const inA = clientAs(tx, person, { sessionId: session.id, activeOrganizationId: a.id })
      expect((await inA.client.account.me()).features.length).toBeGreaterThan(10)
      await inA.client.account.switchOrganization({ organizationId: b.id })
      const inB = clientAs(tx, person, { sessionId: session.id, activeOrganizationId: b.id })
      const me = await inB.client.account.me()
      expect(me.organization).toMatchObject({ id: b.id, internal: false })
      expect(me.features).toEqual([])
    }))
})

describe('Vento Real Estate console isolation', () => {
  it("changes organization A without touching B's features, limits or trail", () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const a = await createOrganization(tx, { name: 'Console A Ltd', planKey: 'starter' })
      const b = await createOrganization(tx, { name: 'Console B Ltd', planKey: 'starter' })
      const meB = async () =>
        await clientAs(tx, b.owner, { activeOrganizationId: b.id }).client.account.me()
      const before = await meB()
      const { client } = consoleClientAs(tx, admin)
      const fields = {
        organizationId: a.id,
        kind: 'limit' as const,
        key: 'members' as const,
        value: 99,
      }
      const preview = await client.console.organizations.setOverride.preview(fields)
      await client.console.organizations.setOverride.apply({
        ...fields,
        expected: preview.expected,
        reason: 'Deal for A',
        idempotencyKey: '6f1f0c52-4c8e-4c1a-9a51-0f0e7b0b8f0a',
      })
      const after = await meB()
      expect(after.features).toEqual(before.features)
      expect(after.plan?.limits).toEqual(before.plan?.limits)
      const trailB = await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, b.id))
      expect(trailB.filter((e) => e.action.startsWith('plan.'))).toEqual([])
    }))

  it("shows one organization's account activity without a row of another's", () =>
    withRollback(async (tx) => {
      const a = await createOrganization(tx, { name: 'Alpha Homes Ltd' })
      const b = await createOrganization(tx, { name: 'Beta Homes Ltd' })
      for (const org of [a, b]) {
        await recordAudit(tx, {
          organizationId: org.id,
          action: 'invitation.accepted',
          actor: { userId: null, name: 'x' },
          target: { type: 'member' },
        })
      }
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin)
      const card = await client.console.organizations.accountActivity({ id: a.id })
      expect(card.feed.length).toBeGreaterThan(0)
      expect(JSON.stringify(card)).not.toContain(b.id)
      expect(JSON.stringify(card)).not.toContain('Beta Homes Ltd')
    }))

  it("reads one organization's detail without another's people or records", () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const a = await createOrganization(tx, { name: 'Console A Ltd' })
      const b = await createOrganization(tx, { name: 'Console B Ltd' })
      await createMember(tx, b, { role: 'sales', name: 'Only-In-B Person' })
      await createEntity(tx, b, { name: 'Only-In-B SPV Ltd' })
      const { client } = consoleClientAs(tx, admin)
      const json = JSON.stringify([
        await client.console.organizations.get({ id: a.id }),
        await client.console.organizations.features({ id: a.id }),
        await client.console.organizations.endedOverrides({ id: a.id }),
      ])
      expect(json).not.toContain('Only-In-B')
      expect(json).not.toContain(b.owner.email)
    }))
})

describe('organization isolation: approvals and audit (brick 4)', () => {
  it('answers not found for their requests, rules and audit entries, changing nothing', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await seedDefaultRules(tx, mine.id, mine.ownerMemberId)
      const theirs = await createOrganization(tx, { name: `Other Developer ${uniqueSuffix()}` })
      await seedDefaultRules(tx, theirs.id, theirs.ownerMemberId)
      await createMember(tx, theirs, { role: 'owner', name: 'Their Second Owner' })
      const theirMaker = await createMember(tx, theirs, { role: 'admin', name: 'Their Admin' })
      const theirRole = await createCustomRole(tx, theirs, { permissions: { projects: ['view'] } })
      await createMember(tx, theirs, { role: 'viewer', roleId: theirRole.id })
      const asked = await clientAs(tx, theirMaker.user).client.roles.update({
        id: theirRole.id,
        version: 1,
        permissions: { ...emptyPermissionSet(), projects: ['view', 'create'] },
        reason: 'Theirs',
      })
      if (asked.outcome?.ran !== false) throw new Error('expected a request')
      const theirRequest = asked.outcome.requestId
      const [theirRule] = await tx
        .select()
        .from(approvalRules)
        .where(eq(approvalRules.organizationId, theirs.id))
      const [theirEvent] = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.organizationId, theirs.id))
      const { client } = clientAs(tx, mine.owner)
      const attempts: [string, () => Promise<unknown>][] = [
        ['approvals.get', () => client.approvals.get({ id: theirRequest })],
        [
          'approvals.decide',
          () => client.approvals.decide({ requestId: theirRequest, decision: 'approve' }),
        ],
        ['approvals.cancel', () => client.approvals.cancel({ id: theirRequest })],
        ['approvalRules.delete', () => client.approvalRules.delete({ id: theirRule?.id ?? '' })],
        [
          'approvalRules.update',
          () =>
            client.approvalRules.update({
              id: theirRule?.id ?? '',
              version: 1,
              actionKey: 'access.role.update',
              when: { kind: 'any' },
              steps: [[mine.roleIds.get('owner') ?? '']],
              entityIds: 'all',
            }),
        ],
        ['audit.get', () => client.audit.get({ id: theirEvent?.id ?? '' })],
      ]
      for (const [name, attempt] of attempts) {
        await expect(attempt(), name).rejects.toMatchObject({ code: 'NOT_FOUND' })
      }
      const [request] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, theirRequest))
      expect(request?.status).toBe('pending')
      expect(
        await tx
          .select()
          .from(approvalDecisions)
          .where(eq(approvalDecisions.requestId, theirRequest)),
      ).toEqual([])
      expect(
        await tx.select().from(approvalRules).where(eq(approvalRules.organizationId, theirs.id)),
      ).toHaveLength(2)
    }))

  it("never lists, counts or previews another organization's approvals or audit", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: `Other Developer ${uniqueSuffix()}` })
      await seedDefaultRules(tx, theirs.id, theirs.ownerMemberId)
      const theirRole = await createCustomRole(tx, theirs, { permissions: { projects: ['view'] } })
      await recordAudit(tx, {
        organizationId: theirs.id,
        action: 'role.updated',
        actor: { userId: theirs.owner.id, name: 'Their Owner Person' },
        target: { type: 'role', id: theirRole.id, label: 'Their engineer' },
      })
      const { client } = clientAs(tx, mine.owner)
      const me = await client.account.me()
      expect(me).toMatchObject({ approvalsWaiting: 0 })
      expect((await client.approvalRules.list()).items.flatMap((g) => g.rules)).toEqual([])
      const audit = await client.audit.list({ from: '2026-01-01', to: lagosIsoDate(new Date()) })
      expect(JSON.stringify(audit)).not.toContain('Their Owner Person')
      expect(
        await client.approvals.preview({
          actionKey: 'access.role.update',
          subject: { type: 'role', id: theirRole.id },
        }),
      ).toEqual({ needed: false })
    }))
})
