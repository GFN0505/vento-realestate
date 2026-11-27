import type { AttentionItem, Dashboard } from '@vento/shared/console'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { members, organizations, platformAuditEvents } from '@/db/schema'
import { recordAudit } from '@/modules/audit/audit.service'
import { withRollback } from '@/test/db'
import {
  createEntity,
  createOrganization,
  createSuperAdmin,
  createUser,
  type TestOrg,
} from '@/test/factories'
import { consoleClientAs } from '@/test/router-client'
import { findPlanVersion } from '../operations/common'
import { startTrial } from '../operations/plans'
import { SETUP_ACTOR } from '../seed-plans'
import { loadSnapshot } from '../snapshot'
import { attentionQueue, get } from './dashboard.service'

// The console Dashboard (admin-console plan §1b.9). Other test files commit data while these run,
// so each test reads a fixed snapshot (repeatable read) and checks its own fixtures, or deltas.

const DAY = 24 * 60 * 60_000

function fixed(fn: (tx: DbOrTx) => Promise<void>) {
  return withRollback(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`)
    await fn(tx)
  })
}

async function queueFor(tx: DbOrTx): Promise<AttentionItem[]> {
  const queue = await attentionQueue(tx, new Date(), await loadSnapshot(tx), 10_000)
  return queue.lists.flatMap((l) => l.rows)
}

const about = (items: AttentionItem[], org: { id: string }) =>
  items.filter((i) => 'organization' in i && i.organization.id === org.id)

/** An organization nobody has used for 18 days, made 20 days ago. */
async function goQuiet(tx: DbOrTx, org: TestOrg) {
  await tx
    .update(organizations)
    .set({ createdAt: new Date(Date.now() - 20 * DAY) })
    .where(eq(organizations.id, org.id))
  await tx
    .update(members)
    .set({ lastActiveAt: new Date(Date.now() - 18 * DAY) })
    .where(eq(members.organizationId, org.id))
}

describe('the Dashboard numbers', () => {
  it('count a new customer organization and its active owner, and leave internal ones out', () =>
    fixed(async (tx) => {
      const before = await get(tx)
      await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      await createOrganization(tx, { name: 'Vento Real Estate QA' })
      const after = await get(tx)
      expect(after.numbers.organizations - before.numbers.organizations).toBe(1)
      expect(after.numbers.newLast7Days - before.numbers.newLast7Days).toBe(1)
      expect(after.header.people - before.header.people).toBe(1)
      expect(after.numbers.activePeople - before.numbers.activePeople).toBe(1)
      expect(after.numbers.activeOrganizations - before.numbers.activeOrganizations).toBe(1)
      expect(after.plans.internal - before.plans.internal).toBe(1)
      expect(
        after.activity.summary.newOrganizations - before.activity.summary.newOrganizations,
      ).toBe(1)
    }))

  it('count a trial ending within 7 days, and a sign-up nobody finished', () =>
    fixed(async (tx) => {
      const before = await get(tx)
      const org = await createOrganization(tx, { planKey: 'starter' })
      await startTrial(tx, SETUP_ACTOR, {
        organization: { id: org.id, name: org.name },
        target: await findPlanVersion(tx, 'enterprise'),
        days: 2,
        reason: 'Dashboard test',
      })
      await createUser(tx, { emailVerified: true })
      const after = await get(tx)
      expect(after.numbers.trialsEndingSoon - before.numbers.trialsEndingSoon).toBe(1)
      expect(after.activity.summary.trialsStarted - before.activity.summary.trialsStarted).toBe(1)
      expect(
        after.activity.summary.signUpsNotFinished - before.activity.summary.signUpsNotFinished,
      ).toBe(1)
    }))

  it('tell over a limit from at a limit', () =>
    fixed(async (tx) => {
      const before = await get(tx)
      const over = await createOrganization(tx, { planKey: 'starter' })
      for (let i = 0; i < 3; i++) await createEntity(tx, over, { name: `Over SPV ${i} Ltd` })
      const at = await createOrganization(tx, { planKey: 'starter' })
      for (let i = 0; i < 2; i++) await createEntity(tx, at, { name: `At SPV ${i} Ltd` })
      const after = await get(tx)
      expect(after.numbers.overLimit - before.numbers.overLimit).toBe(1)
      expect(after.numbers.atLimit - before.numbers.atLimit).toBe(1)
    }))
})

describe('Needs attention', () => {
  it('lists each kind with its words, and never an internal organization', () =>
    fixed(async (tx) => {
      const trial = await createOrganization(tx, { name: 'Trial Homes Ltd', planKey: 'starter' })
      await startTrial(tx, SETUP_ACTOR, {
        organization: { id: trial.id, name: trial.name },
        target: await findPlanVersion(tx, 'enterprise'),
        days: 2,
        reason: 'Dashboard test',
      })
      const over = await createOrganization(tx, { name: 'Parkview Homes', planKey: 'starter' })
      for (let i = 0; i < 3; i++) await createEntity(tx, over, { name: `Parkview SPV ${i} Ltd` })
      const unplanned = await createOrganization(tx, {
        name: 'Abuja Heights Ltd',
        releaseGroup: 'standard',
      })
      const quiet = await createOrganization(tx, {
        name: 'Lekki Pearl Estates',
        planKey: 'starter',
      })
      await goQuiet(tx, quiet)
      const internal = await createOrganization(tx, { name: 'Vento Real Estate QA' })
      await goQuiet(tx, internal)
      const items = await queueFor(tx)
      expect(about(items, trial)).toEqual([
        expect.objectContaining({ kind: 'trial_ending', planName: 'Enterprise' }),
      ])
      expect(about(items, over)).toEqual([
        expect.objectContaining({ kind: 'over_limit', limit: 'entities', used: 3, included: 2 }),
      ])
      expect(about(items, unplanned)).toEqual([
        { kind: 'no_plan', organization: { id: unplanned.id, name: 'Abuja Heights Ltd' } },
      ])
      expect(about(items, quiet)).toEqual([expect.objectContaining({ kind: 'quiet', days: 18 })])
      expect(about(items, internal)).toEqual([])
    }))

  it('counts a quiet organization from its creation when nobody was ever active', () =>
    fixed(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await tx
        .update(organizations)
        .set({ createdAt: new Date(Date.now() - 20 * DAY) })
        .where(eq(organizations.id, org.id))
      await tx.update(members).set({ lastActiveAt: null }).where(eq(members.organizationId, org.id))
      expect(about(await queueFor(tx), org)).toEqual([
        expect.objectContaining({ kind: 'quiet', days: 20 }),
      ])
    }))

  it('shows break-glass changes by a person, including old rows with no channel, but never setup, seed or scheduled rows', () =>
    fixed(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const row = {
        action: 'release.stage_changed',
        targetType: 'feature',
        targetKey: 'sales',
        reason: 'Test',
      }
      await tx.insert(platformAuditEvents).values([
        {
          ...row,
          actorUserId: ada.id,
          actorName: 'Ada Okafor',
          channel: 'command',
          before: { stage: 'on' },
          after: { stage: 'off' },
        },
        { ...row, actorUserId: ada.id, actorName: 'Legacy Person', channel: null },
        { ...row, actorName: 'Vento (scheduled)', channel: null },
        { ...row, actorName: 'Vento Real Estate (scheduled)', channel: 'scheduled' },
        // Migration 0014 and the seed write command rows with no person behind them.
        { ...row, actorName: 'Vento Real Estate (setup)', channel: 'command' },
        { ...row, actorName: 'Vento (setup)', channel: null },
        { ...row, actorName: 'Seed Person', channel: 'command' },
      ])
      const cli = (await queueFor(tx)).filter((i) => i.kind === 'command_line')
      const names = cli.map((i) => (i.kind === 'command_line' ? i.actorName : ''))
      expect(names).toContain('Ada Okafor')
      expect(names).toContain('Legacy Person')
      expect(names).not.toContain('Vento (scheduled)')
      expect(names).not.toContain('Vento Real Estate (scheduled)')
      expect(names).not.toContain('Vento Real Estate (setup)')
      expect(names).not.toContain('Vento (setup)')
      expect(names).not.toContain('Seed Person')
      expect(
        cli.find((i) => i.kind === 'command_line' && i.actorName === 'Ada Okafor'),
      ).toMatchObject({
        summary: 'Moved Sales to off',
      })
    }))

  it('leaves rows with no person out of the command-line count too', () =>
    fixed(async (tx) => {
      const count = async () => {
        const queue = await attentionQueue(tx, new Date(), await loadSnapshot(tx))
        return queue.lists[0]?.total ?? 0
      }
      const before = await count()
      const row = { action: 'superadmin.revoked', targetType: 'user', reason: 'Setup' }
      await tx.insert(platformAuditEvents).values([
        { ...row, actorName: 'Vento Real Estate (setup)', channel: 'command' },
        { ...row, actorName: 'Someone', channel: 'command' },
      ])
      expect(await count()).toBe(before)
      const ada = await createSuperAdmin(tx)
      await tx
        .insert(platformAuditEvents)
        .values({ ...row, actorUserId: ada.id, actorName: ada.name, channel: 'command' })
      expect(await count()).toBe(before + 1)
    }))

  it('shows at most 8 rows, then how many more', () =>
    fixed(async (tx) => {
      for (let i = 0; i < 9; i++) await createOrganization(tx, { releaseGroup: 'standard' })
      const dashboard = await get(tx)
      expect(dashboard.attention.items).toHaveLength(8)
      expect(dashboard.attention.more).toBeGreaterThanOrEqual(1)
    }))
})

describe('customer activity', () => {
  it('groups events per organization, kind and day, and counts a new owner only by role key', () =>
    fixed(async (tx) => {
      const org = await createOrganization(tx, { name: 'Feed Homes Ltd', planKey: 'starter' })
      const internal = await createOrganization(tx)
      const event = (
        organizationId: string,
        action: 'invitation.accepted' | 'member.access_changed',
        metadata = {},
      ) =>
        recordAudit(tx, {
          organizationId,
          action,
          actor: { userId: null, name: 'Olumide Bankole' },
          target: { type: 'member', label: 'Aisha Bello' },
          metadata,
        })
      for (let i = 0; i < 3; i++) await event(org.id, 'invitation.accepted')
      await event(org.id, 'member.access_changed', { roleKey: 'owner' })
      await event(org.id, 'member.access_changed', { roleKey: 'admin' })
      await event(internal.id, 'invitation.accepted')
      const feed = (await get(tx)).activity.feed
      const ours = feed.filter((r) => r.organization.id === org.id)
      expect(ours.map((r) => [r.kind, r.count]).sort()).toEqual([
        ['new_owner', 1],
        ['people_joined', 3],
      ])
      expect(feed.some((r) => r.organization.id === internal.id)).toBe(false)
    }))

  it('carries facts only: no member names, emails, IPs or devices', () =>
    fixed(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await recordAudit(tx, {
        organizationId: org.id,
        action: 'invitation.accepted',
        actor: { userId: org.owner.id, name: org.owner.name },
        target: { type: 'member', label: 'Aisha Bello' },
      })
      const ada = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, ada)
      const dashboard: Dashboard = await client.console.dashboard.get()
      const card = await client.console.organizations.accountActivity({ id: org.id })
      for (const json of [JSON.stringify(dashboard.activity), JSON.stringify(card)]) {
        expect(json).not.toContain(org.owner.name)
        expect(json).not.toContain(org.owner.email)
        expect(json).not.toContain('Aisha Bello')
        expect(json).not.toMatch(/\d+\.\d+\.\d+\.(\d+|x)/)
        expect(json).not.toMatch(/Chrome|Safari|Firefox/)
      }
    }))
})

describe('Account activity on organization detail', () => {
  it('counts people active this week and shows only that organization’s rows', () =>
    fixed(async (tx) => {
      const a = await createOrganization(tx, { planKey: 'starter' })
      const b = await createOrganization(tx, { planKey: 'starter' })
      for (const org of [a, b]) {
        await recordAudit(tx, {
          organizationId: org.id,
          action: 'entity.created',
          actor: { userId: null, name: 'x' },
          target: { type: 'entity' },
        })
      }
      const ada = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, ada)
      const card = await client.console.organizations.accountActivity({ id: a.id })
      expect(card).toMatchObject({ people: 1, activeLast7Days: 1 })
      expect(card.lastActiveAt).not.toBeNull()
      expect(card.feed.map((r) => r.organization.id)).toEqual([a.id])
      await expect(
        client.console.organizations.accountActivity({
          id: '01936f1e-8b2a-7c3d-9e4f-000000000009',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))
})

describe('plans and releases', () => {
  it('counts organizations per plan and version, with internal and no plan apart', () =>
    fixed(async (tx) => {
      const before = await get(tx)
      await createOrganization(tx, { planKey: 'growth' })
      await createOrganization(tx, { releaseGroup: 'standard' })
      const after = await get(tx)
      const growth = (d: Dashboard) => d.plans.byPlan.find((p) => p.key === 'growth')?.total ?? 0
      expect(growth(after) - growth(before)).toBe(1)
      expect(after.plans.noPlan - before.plans.noPlan).toBe(1)
      expect(after.plans.byPlan.map((p) => p.key)).toEqual(
        expect.arrayContaining(['starter', 'growth', 'enterprise']),
      )
    }))
})
