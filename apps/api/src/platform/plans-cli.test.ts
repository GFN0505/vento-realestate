import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  auditEvents,
  organizationOverrides,
  organizationPlans,
  organizationTrials,
  planVersions,
  platformAuditEvents,
} from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { withRollback } from '@/test/db'
import {
  createEntity,
  createOrganization,
  createSuperAdmin,
  setOverride,
  type TestOrg,
} from '@/test/factories'
import { memoryIo } from './cli/io'
import { runCommand } from './cli/run'
import { findPlanVersion } from './operations/common'
import { notifyTrials } from './operations/notify-trials'
import { startTrial } from './operations/plans'

// J-ADM-02: put an organization on a plan, start a trial, record a deal, add AI.

const NOW = new Date('2026-12-03T09:00:00Z')

async function run(db: DbOrTx, args: string[], answers: boolean[] = [true]) {
  const io = memoryIo(answers)
  const mailer = createMemoryTransport()
  const code = await runCommand('plans', args, {
    db,
    io,
    operator: 'ada@ops-laptop',
    mailer,
    now: () => NOW,
  })
  return { code, io, mailer }
}

async function notices(tx: DbOrTx, org: TestOrg, action: string) {
  const rows = await tx
    .select({ metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, action)))
  return rows.map((r) => (r.metadata as { message: string }).message)
}

const by = (email: string) => ['--reason', 'Signed annual plan', '--by', email]

describe('pnpm plans', () => {
  it('assigns a plan, warning when the organization is over a limit, and archives nothing', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'growth' })
      for (const name of ['A Ltd', 'B Ltd', 'C Ltd']) await createEntity(tx, org, { name })
      const { code, io } = await run(tx, [
        'assign',
        'Lekki Partners Ltd',
        'starter',
        ...by(admin.email),
      ])
      expect(code).toBe(0)
      expect(io.output).toContain(
        "Lekki Partners Ltd has 3 active entities; Starter includes 2. Nothing is archived, but they can't add entities.",
      )
      const starter = await findPlanVersion(tx, 'starter')
      const [row] = await tx
        .select()
        .from(organizationPlans)
        .where(eq(organizationPlans.organizationId, org.id))
      expect(row?.planVersionId).toBe(starter.versionId)
      expect(await notices(tx, org, 'plan.assigned')).toEqual([
        'Vento moved your organization to Starter',
      ])
      const [platform] = await tx
        .select()
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.organizationId, org.id),
            eq(platformAuditEvents.action, 'plan.assigned'),
          ),
        )
      expect(platform).toMatchObject({
        before: { plan: 'Growth v1' },
        after: { plan: 'Starter v1' },
        reason: 'Signed annual plan',
        operator: 'ada@ops-laptop',
      })
    }))

  it('starts a trial with overrides only for what is missing, all ending together', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'growth' })
      await setOverride(tx, org, { kind: 'feature', key: 'finance.tax', enabled: false })
      const { io } = await run(tx, [
        'trial',
        'Lekki Partners Ltd',
        'enterprise',
        '--days',
        '30',
        ...by(admin.email),
      ])
      expect(io.output.at(-1)).toBe(
        'Lekki Partners Ltd has an Enterprise trial until 2 Jan 2027: 6 features and 3 limits added. Takes effect within 30 seconds.',
      )
      const rows = await tx
        .select()
        .from(organizationOverrides)
        .where(
          and(
            eq(organizationOverrides.organizationId, org.id),
            isNull(organizationOverrides.clearedAt),
          ),
        )
      const trialRows = rows.filter((r) => r.trialId)
      expect(trialRows.map((r) => r.key).sort()).toEqual([
        'analytics.board_pack',
        'documents.contracts',
        'entities',
        'finance.close',
        'finance.facilities',
        'finance.intercompany',
        'finance.revenue_recognition',
        'members',
        'projects',
      ])
      expect(new Set(trialRows.map((r) => r.expiresAt?.toISOString()))).toEqual(
        new Set(['2027-01-02T23:00:00.000Z']),
      )
      expect(trialRows.filter((r) => r.kind === 'limit').every((r) => r.limitValue === null)).toBe(
        true,
      )
      expect(await notices(tx, org, 'plan.trial_started')).toEqual([
        'Vento started a 30-day Enterprise trial (ends 2 Jan 2027)',
      ])
    }))

  it('ends a live trial when the organization is assigned a plan', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      await run(tx, ['trial', org.name, 'enterprise', '--days', '30', ...by(admin.email)])
      const { io } = await run(tx, ['assign', org.name, 'growth', ...by(admin.email)])
      expect(io.output).toContain('Their trial ending 2 Jan 2027 will end now.')
      const [trial] = await tx
        .select()
        .from(organizationTrials)
        .where(eq(organizationTrials.organizationId, org.id))
      expect(trial?.cancelledAt).toBeInstanceOf(Date)
      const live = await tx
        .select()
        .from(organizationOverrides)
        .where(
          and(
            eq(organizationOverrides.organizationId, org.id),
            isNull(organizationOverrides.clearedAt),
          ),
        )
      expect(live).toEqual([])
      expect(await notices(tx, org, 'plan.trial_cancelled')).toEqual([
        'Vento ended your Enterprise trial',
      ])
    }))

  it('publishes version 2 while organizations stay on version 1, and versions never change', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { planKey: 'growth' })
      const v1 = await findPlanVersion(tx, 'growth')
      const file = join(tmpdir(), `growth-${Date.now()}.json`)
      await writeFile(
        file,
        JSON.stringify({
          key: 'growth',
          name: 'Growth',
          sortOrder: 2,
          features: ['land'],
          limits: { projects: 8 },
        }),
      )
      const { io } = await run(tx, ['publish', 'growth', '--from', file, ...by(admin.email)])
      expect(io.output.at(-1)).toBe(
        'Growth version 2 is published. Organizations on earlier versions stay there until you assign them.',
      )
      const [row] = await tx
        .select()
        .from(organizationPlans)
        .where(eq(organizationPlans.organizationId, org.id))
      expect(row?.planVersionId).toBe(v1.versionId)
      await expect(
        tx.transaction((inner) =>
          inner
            .update(planVersions)
            .set({ reason: 'edited' })
            .where(eq(planVersions.id, v1.versionId)),
        ),
      ).rejects.toThrow()
    }))

  it('refuses a plan file naming a key the catalog does not know', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const file = join(tmpdir(), `bad-${Date.now()}.json`)
      await writeFile(
        file,
        JSON.stringify({
          key: 'growth',
          name: 'Growth',
          sortOrder: 2,
          features: ['sales.comissions'],
          limits: {},
        }),
      )
      const { code, io } = await run(tx, ['publish', 'growth', '--from', file, ...by(admin.email)])
      expect(code).toBe(1)
      expect(io.errors[0]).toContain("isn't a valid plan")
    }))

  it('adds AI with a monthly budget, in plain words for the organization', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      await run(tx, ['addon', org.name, 'ai', '--budget', '150000', ...by(admin.email)])
      expect(await notices(tx, org, 'plan.add_on_added')).toEqual([
        'Vento added AI (₦150,000 a month)',
      ])
      await run(tx, ['addon', org.name, 'ai', '--remove', ...by(admin.email)])
      expect(await notices(tx, org, 'plan.add_on_removed')).toEqual(['Vento removed AI'])
    }))

  it('records a negotiated limit and a feature until a date', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'growth' })
      await run(tx, ['override', org.name, 'limit', 'projects', '8', ...by(admin.email)])
      await run(tx, [
        'override',
        org.name,
        'feature',
        'sales.commissions',
        'on',
        '--until',
        '2027-01-31',
        ...by(admin.email),
      ])
      expect(await notices(tx, org, 'plan.limit_overridden')).toEqual([
        'Vento set your limit to 8 active projects',
      ])
      expect(await notices(tx, org, 'plan.feature_overridden')).toEqual([
        'Vento added Commissions to your organization (until 31 Jan 2027)',
      ])
      const { code, io } = await run(tx, [
        'override',
        org.name,
        'limit',
        'units',
        '8',
        ...by(admin.email),
      ])
      expect(code).toBe(1)
      expect(io.errors[0]).toMatch(/^Unknown limit "units"/)
    }))
})

describe('plans notify-trials', () => {
  it('emails owners 7 days and 1 day before the end once each, then records the end once', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      const target = await findPlanVersion(tx, 'enterprise')
      const actor = { userId: null, name: 'Test', operator: null }
      await startTrial(
        tx,
        actor,
        { organization: org, target, days: 30, reason: 'Board pack trial' },
        NOW,
      )
      const mailer = createMemoryTransport()
      const at = (iso: string) => notifyTrials(tx, mailer, new Date(iso))

      expect(await at('2026-12-20T07:00:00Z')).toEqual({ emailed: 0, ended: 0 })
      expect(await at('2026-12-26T07:00:00Z')).toEqual({ emailed: 1, ended: 0 }) // 7 days left
      expect(await at('2026-12-27T07:00:00Z')).toEqual({ emailed: 0, ended: 0 })
      expect(await at('2027-01-01T07:00:00Z')).toEqual({ emailed: 1, ended: 0 }) // 1 day left
      expect(await at('2027-01-01T08:00:00Z')).toEqual({ emailed: 0, ended: 0 })
      expect(await at('2027-01-03T07:00:00Z')).toEqual({ emailed: 0, ended: 1 })
      expect(await at('2027-01-04T07:00:00Z')).toEqual({ emailed: 0, ended: 0 })

      const sent = mailer.to(org.owner.email)
      expect(sent.map((m) => m.subject)).toEqual([
        'Your Enterprise trial ends on 2 Jan 2027',
        'Your Enterprise trial ends on 2 Jan 2027',
      ])
      expect(sent[0]?.tag).toBe('trial_ending')
      expect(sent[0]?.text).toContain('Your data stays.')
      expect(await notices(tx, org, 'plan.trial_ended')).toEqual(['Your Enterprise trial ended'])
    }))
})
