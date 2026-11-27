import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db as pool } from '@/db/client'
import { auditEvents, organizationPlans, platformAuditEvents, staffInvitations } from '@/db/schema'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  addAddOnRow,
  createEntity,
  createMember,
  createOrganization,
  createSuperAdmin,
  createUser,
  setOverride,
} from '@/test/factories'
import { consoleClientAs } from '@/test/router-client'
import { findPlanVersion } from '../operations/common'
import { SCHEDULED_ACTOR } from '../platform-audit'
import { applyOnce } from './apply-once'
import { changePlanChange } from './changes'

const why = { reason: 'Signed annual plan' }
const key = () => ({ idempotencyKey: randomUUID() })
const unique = (name: string) => `${name} ${uniqueEmail('o').slice(0, 12)}`

describe('organizations', () => {
  it('lists facts only: the owner, counts and plan, never other members', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const name = unique('Lekki Partners')
      const org = await createOrganization(tx, { name, planKey: 'growth' })
      await createMember(tx, org, { role: 'sales', name: 'Chidi Secret-Salesperson' })
      const { client } = consoleClientAs(tx, admin)
      const page = await client.console.organizations.list({ search: name.slice(-12) })
      expect(page.items).toEqual([
        expect.objectContaining({
          id: org.id,
          owner: { name: 'Olumide Bankole', email: org.owner.email },
          plan: { name: 'Growth', version: expect.any(Number) },
          people: 2,
          overLimit: false,
        }),
      ])
      expect(JSON.stringify(page)).not.toContain('Secret-Salesperson')
    }))

  it('finds an organization by its owner’s email', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: unique('Abuja Homes') })
      const { client } = consoleClientAs(tx, admin)
      const page = await client.console.organizations.list({ search: org.owner.email })
      expect(page.items.map((o) => o.id)).toEqual([org.id])
    }))

  it('marks an organization over a limit after a downgrade, and filters by it', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const name = unique('Ikoyi Towers')
      const org = await createOrganization(tx, { name, planKey: 'growth' })
      for (const n of ['A', 'B', 'C']) await createEntity(tx, org, { name: `${n} Ltd` })
      const starter = await findPlanVersion(tx, 'starter')
      await tx
        .update(organizationPlans)
        .set({ planVersionId: starter.versionId })
        .where(eq(organizationPlans.organizationId, org.id))
      const { client } = consoleClientAs(tx, admin)
      const over = await client.console.organizations.list({ filter: 'over_limit' })
      expect(over.items.map((o) => o.id)).toContain(org.id)
      const detail = await client.console.organizations.get({ id: org.id })
      expect(detail.limits).toContainEqual({ key: 'entities', included: 2, used: 3 })
      // Projects aren't counted yet, so the limit is hidden (owner's decision, plan §16).
      expect(detail.limits.map((l) => l.key)).not.toContain('projects')
    }))

  it('shows a plan, AI, live and ended overrides on the detail', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { planKey: 'growth' })
      await addAddOnRow(tx, org, { budget: '250000.00' })
      await setOverride(tx, org, { kind: 'limit', key: 'members', limitValue: '60.00' })
      await setOverride(tx, org, {
        kind: 'feature',
        key: 'finance.tax',
        enabled: true,
        expiresAt: new Date(Date.now() - 1000),
      })
      const { client } = consoleClientAs(tx, admin)
      const detail = await client.console.organizations.get({ id: org.id })
      expect(detail.plan).toMatchObject({ key: 'growth', name: 'Growth' })
      expect(detail.addOns).toEqual([expect.objectContaining({ key: 'ai', budget: '250000.00' })])
      expect(detail.overrides).toEqual([
        expect.objectContaining({ kind: 'limit', key: 'members', value: '60.00' }),
      ])
      expect(detail.endedOverrideCount).toBe(1)
      const ended = await client.console.organizations.endedOverrides({ id: org.id })
      expect(ended.items).toEqual([expect.objectContaining({ key: 'finance.tax' })])
    }))

  it('reads an internal organization with no plan', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx)
      const { client } = consoleClientAs(tx, admin)
      const detail = await client.console.organizations.get({ id: org.id })
      expect(detail).toMatchObject({ plan: null, releaseGroup: 'internal' })
      expect(detail.limits.every((l) => l.included === null)).toBe(true)
      const features = await client.console.organizations.features({ id: org.id })
      expect(features.find((f) => f.key === 'documents')).toMatchObject({
        available: true,
        reason: 'Early access (internal)',
      })
    }))

  it('answers NOT_FOUND for an organization that does not exist', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin)
      await expect(
        client.console.organizations.get({ id: '0193f2a0-0000-7000-8000-000000000001' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }))
})

describe('changes', () => {
  it('changes a plan once per key, and tells the customer in plain words', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      const { client } = consoleClientAs(tx, admin)
      const fields = { organizationId: org.id, planKey: 'growth' }
      const preview = await client.console.organizations.changePlan.preview(fields)
      const input = { ...fields, expected: preview.expected, ...why, ...key() }
      const first = await client.console.organizations.changePlan.apply(input)
      expect(first.message).toMatch(/^Lekki Partners Ltd is now on Growth/)
      await expect(client.console.organizations.changePlan.apply(input)).resolves.toEqual(first)
      const events = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.organizationId, org.id))
      expect(events).toEqual([
        expect.objectContaining({
          action: 'plan.assigned',
          channel: 'console',
          actorUserId: admin.id,
        }),
      ])
      const [notice] = await tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, 'plan.assigned')))
      expect(notice).toMatchObject({
        actorName: 'Vento Real Estate',
        actorUserId: null,
        metadata: { message: 'Vento Real Estate moved your organization to Growth' },
      })
      expect(JSON.stringify(notice)).not.toContain(admin.name)
      expect(JSON.stringify(notice)).not.toContain(why.reason)
    }))

  it("refuses someone else's key", () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Ola' })
      const org = await createOrganization(tx, { planKey: 'starter' })
      const fields = { organizationId: org.id, planKey: 'growth' }
      const ids = key()
      const ada1 = consoleClientAs(tx, ada).client
      const preview = await ada1.console.organizations.changePlan.preview(fields)
      await ada1.console.organizations.changePlan.apply({
        ...fields,
        expected: preview.expected,
        ...why,
        ...ids,
      })
      await expect(
        consoleClientAs(tx, tunde).client.console.organizations.changePlan.apply({
          ...fields,
          expected: preview.expected,
          ...why,
          ...ids,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'platform_refused' } })
    }))

  it('says who moved it when the preview is stale', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Ola' })
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      const fields = { organizationId: org.id, planKey: 'growth' }
      const adaClient = consoleClientAs(tx, ada).client
      const tundeClient = consoleClientAs(tx, tunde).client
      const stale = await adaClient.console.organizations.changePlan.preview(fields)
      const enterprise = { organizationId: org.id, planKey: 'enterprise' }
      const tundePreview = await tundeClient.console.organizations.changePlan.preview(enterprise)
      await tundeClient.console.organizations.changePlan.apply({
        ...enterprise,
        expected: tundePreview.expected,
        ...why,
        ...key(),
      })
      await expect(
        adaClient.console.organizations.changePlan.apply({
          ...fields,
          expected: stale.expected,
          ...why,
          ...key(),
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message:
          'Tunde Ola moved Lekki Partners Ltd to Enterprise v1 since you opened this. Check the preview and try again.',
        data: { reason: 'platform_stale', changedByName: 'Tunde Ola' },
      })
    }))

  it('refuses a second trial with the End trial next step', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      const { client } = consoleClientAs(tx, admin)
      const fields = { organizationId: org.id, planKey: 'enterprise', days: 30 }
      const preview = await client.console.organizations.startTrial.preview(fields)
      await client.console.organizations.startTrial.apply({
        ...fields,
        expected: preview.expected,
        ...why,
        ...key(),
      })
      await expect(client.console.organizations.startTrial.preview(fields)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'platform_refused', next: 'end_trial' },
      })
    }))

  it('sets and clears a count limit override', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { planKey: 'growth' })
      const { client } = consoleClientAs(tx, admin)
      const set = {
        organizationId: org.id,
        kind: 'limit' as const,
        key: 'entities' as const,
        value: 8,
      }
      const preview = await client.console.organizations.setOverride.preview(set)
      await client.console.organizations.setOverride.apply({
        ...set,
        expected: preview.expected,
        ...why,
        ...key(),
      })
      const clear = { organizationId: org.id, kind: 'limit' as const, key: 'entities' as const }
      const clearPreview = await client.console.organizations.clearOverride.preview(clear)
      expect(clearPreview.lines[0]?.text).toMatch(/goes back to Growth's 6\.$/)
      await expect(
        client.console.organizations.clearOverride.apply({
          ...clear,
          expected: clearPreview.expected,
          ...why,
          ...key(),
        }),
      ).resolves.toMatchObject({ message: expect.stringMatching(/back to the plan's/) })
    }))
})

describe('idempotency under concurrency', () => {
  it('applies two identical requests at once only once', async () => {
    const admin = await createSuperAdmin(pool, { email: uniqueEmail('ada.race') })
    const org = await createOrganization(pool, { name: unique('Race Homes'), planKey: 'starter' })
    const input = {
      organizationId: org.id,
      planKey: 'growth',
      expected: { planVersionId: (await findPlanVersion(pool, 'starter')).versionId },
      ...why,
      ...key(),
    }
    const run = () =>
      applyOnce(
        pool,
        { userId: admin.id, name: admin.name },
        { path: 'organizations.changePlan.apply', input },
        (actor) => changePlanChange.apply(pool, actor, input),
      )
    const [a, b] = await Promise.all([run(), run()])
    expect(a).toEqual(b)
    const events = await pool
      .select()
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.idempotencyKey, input.idempotencyKey))
    expect(events).toHaveLength(1)
  })
})

describe('releases and plans', () => {
  it('lists the catalog with who has each feature, and filters to features in no plan', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin)
      const all = await client.console.releases.list({})
      expect(all.items.length).toBeGreaterThan(30)
      const noPlan = await client.console.releases.list({ filter: 'in_no_plan' })
      expect(noPlan.items.every((r) => r.plans.length === 0 && !r.core && !r.addOn)).toBe(true)
      const detail = await client.console.releases.get({ key: 'sales' })
      expect(detail).toMatchObject({ key: 'sales', needs: ['projects'], stage: expect.any(String) })
      expect(detail.holders.map((h) => h.group)).toEqual(['internal', 'pilot', 'standard'])
    }))

  it("lists every live plan's latest version on a feature, and whether it's included", () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin)
      const detail = await client.console.releases.get({ key: 'sales' })
      const keys = detail.planVersions.map((p) => p.key)
      expect(keys.slice(0, 3)).toEqual(['starter', 'growth', 'enterprise'])
      for (const p of detail.planVersions) {
        expect(p.included).toBe(detail.plans.includes(p.name))
        expect(p.version).toBeGreaterThanOrEqual(1)
      }
    }))

  it('publishes a new version without moving anyone', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { planKey: 'growth' })
      const growth = await findPlanVersion(tx, 'growth')
      const { client } = consoleClientAs(tx, admin)
      const definition = {
        key: 'growth',
        name: 'Growth',
        sortOrder: growth.sortOrder,
        features: growth.features as never[],
        limits: { projects: 8, entities: 6, members: 40, ai_budget: '0' },
        isNew: false,
      }
      const preview = await client.console.plans.publish.preview(definition)
      await client.console.plans.publish.apply({
        ...definition,
        expected: preview.expected,
        ...why,
        ...key(),
      })
      const detail = await client.console.plans.get({ key: 'growth' })
      expect(detail.versions[0]?.version).toBe(growth.version + 1)
      const [row] = await tx
        .select()
        .from(organizationPlans)
        .where(eq(organizationPlans.organizationId, org.id))
      expect(row?.planVersionId).toBe(growth.versionId)
    }))
})

describe('super-admins', () => {
  it('invites someone and emails them and the others', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const other = await createSuperAdmin(tx, { name: 'Bola Ade' })
      const email = uniqueEmail('tunde')
      const { client, mailer } = consoleClientAs(tx, ada)
      const preview = await client.console.superAdmins.invite.preview({ email, name: 'Tunde Ola' })
      await client.console.superAdmins.invite.apply({
        email,
        name: 'Tunde Ola',
        expected: preview.expected,
        ...why,
        ...key(),
      })
      expect(mailer.to(email).at(-1)?.subject).toBe(
        'Ada Okafor invited you to the Vento Real Estate console',
      )
      expect(mailer.to(other.email).at(-1)?.subject).toBe(
        `Ada Okafor invited Tunde Ola (${email}) to be a super-admin`,
      )
      expect(mailer.to(ada.email)).toEqual([])
      const invitations = await client.console.superAdmins.invitations()
      expect(invitations.find((i) => i.email === email)).toMatchObject({
        name: 'Tunde Ola',
        invitedByName: 'Ada Okafor',
        status: 'pending',
      })
    }))

  it('refuses an email that has a customer account', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const customer = await createUser(tx, { name: 'Tunde Ola' })
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.invite.preview({ email: customer.email, name: 'Tunde Ola' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'platform_refused' },
        message: `${customer.email} already has a Vento Real Estate customer account. Invite a different email, such as their @ventoerp.com address.`,
      })
    }))

  it('lists super-admins with who can be reset, never yourself', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Ola' })
      const { client } = consoleClientAs(tx, ada)
      const list = await client.console.superAdmins.list()
      expect(list.find((r) => r.userId === ada.id)).toMatchObject({
        isYou: true,
        canResetTwoStep: false,
      })
      expect(list.find((r) => r.userId === tunde.id)).toMatchObject({ canResetTwoStep: true })
    }))

  it("won't let you remove yourself", () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.remove.preview({ userId: ada.id }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: "You can't remove yourself. Ask another super-admin.",
      })
    }))
})

describe('activity', () => {
  it('labels rows from before the console, and shows the console operator', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { planKey: 'starter' })
      // A row written before the console: no channel.
      await tx.insert(platformAuditEvents).values({
        actorName: SCHEDULED_ACTOR.name,
        action: 'plan.trial_ended',
        targetType: 'organization',
        targetKey: org.id,
        organizationId: org.id,
        reason: 'Trial ended',
      })
      const { client } = consoleClientAs(tx, ada)
      const fields = { organizationId: org.id, planKey: 'growth' }
      const preview = await client.console.organizations.changePlan.preview(fields)
      await client.console.organizations.changePlan.apply({
        ...fields,
        expected: preview.expected,
        ...why,
        ...key(),
      })
      const page = await client.console.activity.list({ organizationId: org.id })
      expect(page.items.map((r) => [r.channel, r.summary])).toEqual([
        ['console', `Moved ${org.name} to Growth v1`],
        ['scheduled', `${org.name}'s trial ended`],
      ])
      expect(page.items[0]?.operator).toMatch(/^console · /)
      const mine = await client.console.activity.list({ actorUserId: ada.id, kind: 'plan' })
      expect(mine.total).toBe(1)
      expect(await client.console.activity.people()).toContainEqual({
        userId: ada.id,
        name: ada.name,
      })
    }))
})

describe('filters added for the web', () => {
  it('lists organizations on one plan version, and names the organization on its activity', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const name = unique('Plan Filter')
      const org = await createOrganization(tx, { name, planKey: 'growth' })
      await createOrganization(tx, { name: unique('Plan Filter'), planKey: 'starter' })
      const growth = await findPlanVersion(tx, 'growth')
      const { client } = consoleClientAs(tx, admin)
      const page = await client.console.organizations.list({
        search: 'Plan Filter',
        planKey: 'growth',
        version: growth.version,
      })
      expect(page.items.map((o) => o.id)).toEqual([org.id])
      const activity = await client.console.activity.list({ organizationId: org.id })
      expect(activity).toMatchObject({ total: 0, organizationName: name })
    }))
})

describe('idempotency keys', () => {
  it('refuse the same key for a different change (L2)', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { planKey: 'starter' })
      const { client } = consoleClientAs(tx, admin)
      const ids = key()
      const fields = { organizationId: org.id, planKey: 'growth' }
      const preview = await client.console.organizations.changePlan.preview(fields)
      await client.console.organizations.changePlan.apply({
        ...fields,
        expected: preview.expected,
        ...why,
        ...ids,
      })
      await expect(
        client.console.organizations.changePlan.apply({
          organizationId: org.id,
          planKey: 'enterprise',
          expected: preview.expected,
          ...why,
          ...ids,
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'That change key was used for a different change. Start again.',
      })
    }))

  it('sends the invitation once when the same invite arrives twice at once (R4)', async () => {
    const ada = await createSuperAdmin(pool, { email: uniqueEmail('ada.r4') })
    const email = uniqueEmail('kemi.r4')
    const input = { email, name: 'Kemi Ojo', expected: {}, ...why, ...key() }
    const first = consoleClientAs(pool, ada)
    const second = consoleClientAs(pool, ada)
    try {
      const [a, b] = await Promise.all([
        first.client.console.superAdmins.invite.apply(input),
        second.client.console.superAdmins.invite.apply(input),
      ])
      expect(a).toEqual(b)
      const invitations = [...first.mailer.to(email), ...second.mailer.to(email)]
      expect(invitations).toHaveLength(1)
    } finally {
      // Committed: don't leave an open invitation counting towards other tests' limit of 5.
      await pool.delete(staffInvitations).where(eq(staffInvitations.email, email))
    }
  })
})
