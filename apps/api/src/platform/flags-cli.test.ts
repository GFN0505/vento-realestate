import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  auditEvents,
  featureReleases,
  organizationOverrides,
  plans,
  platformAuditEvents,
} from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { withRollback } from '@/test/db'
import { createOrganization, createSuperAdmin, createUser, setStage } from '@/test/factories'
import { memoryIo } from './cli/io'
import { runCommand } from './cli/run'

// J-ADM-01: release a feature stage by stage, to a pilot, and switch it off.

async function run(db: DbOrTx, args: string[], answers: boolean[] = [true]) {
  const io = memoryIo(answers)
  const code = await runCommand('flags', args, {
    db,
    io,
    operator: 'ada@ops-laptop',
    mailer: createMemoryTransport(),
    now: () => new Date(),
  })
  return { code, io }
}

const why = ['--reason', 'Release 1 pilot']

async function stageRow(tx: DbOrTx, key: string) {
  const [row] = await tx.select().from(featureReleases).where(eq(featureReleases.featureKey, key))
  return row
}

describe('pnpm flags', () => {
  it('refuses an unknown flag and suggests the closest one', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { code, io } = await run(tx, [
        'stage',
        'sales.comissions',
        'on',
        ...why,
        '--by',
        admin.email,
      ])
      expect(code).toBe(1)
      expect(io.errors).toEqual([
        'Unknown flag "sales.comissions". Did you mean sales.commissions?',
      ])
      expect(await stageRow(tx, 'sales.comissions')).toBeUndefined()
    }))

  it('refuses anyone who is not a super-admin, and a change with no reason', () =>
    withRollback(async (tx) => {
      const owner = await createUser(tx, { twoFactorEnabled: true })
      const noTwoStep = await createSuperAdmin(tx, { twoFactorEnabled: false })
      const admin = await createSuperAdmin(tx)
      for (const by of [owner.email, noTwoStep.email]) {
        const { code, io } = await run(tx, ['stage', 'sales', 'on', ...why, '--by', by])
        expect(code).toBe(1)
        expect(io.errors).toEqual(['Only Vento super-admins can change flags and plans.'])
      }
      const { io } = await run(tx, ['stage', 'sales', 'on', '--by', admin.email])
      expect(io.errors).toEqual(['Add --reason so the audit trail says why.'])
      expect(await stageRow(tx, 'sales')).toBeUndefined()
    }))

  it('writes nothing when the answer is no', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { code, io } = await run(
        tx,
        ['stage', 'sales', 'on', ...why, '--by', admin.email],
        [false],
      )
      expect(code).toBe(0)
      expect(io.questions).toEqual(['Continue?'])
      expect(io.output.at(-1)).toBe('Nothing changed.')
      expect(await stageRow(tx, 'sales')).toBeUndefined()
    }))

  it('shows who gets it by release group, then records the change in the platform trail', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      await createOrganization(tx, { name: 'Vento Demo Ltd', releaseGroup: 'internal' })
      for (const name of ['Lekki Partners Ltd', 'Abuja Homes Ltd']) {
        await createOrganization(tx, { name, releaseGroup: 'pilot', planKey: 'enterprise' })
      }
      await createOrganization(tx, { name: 'Ikoyi Towers Ltd', planKey: 'enterprise' })
      await setStage(tx, 'projects', 'pilot')
      const { io } = await run(tx, ['stage', 'sales', 'pilot', ...why, '--by', admin.email])
      // Other test files commit internal organizations, so only the pilot count is exact here.
      expect(io.output[0]).toMatch(
        /^Sales will be available to \d+ organizations \(\d+ internal, 2 pilot\)\.$/,
      )
      expect(io.output.at(-1)).toBe('Sales is now at pilot. Takes effect within 30 seconds.')
      expect((await stageRow(tx, 'sales'))?.stage).toBe('pilot')
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.targetKey, 'sales'))
      expect(event).toMatchObject({
        action: 'release.stage_changed',
        actorName: 'Ada Okafor',
        operator: 'ada@ops-laptop',
        before: { stage: 'internal' },
        after: { stage: 'pilot' },
        reason: 'Release 1 pilot',
      })
    }))

  it('warns when a released feature is in no plan', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      await tx.update(plans).set({ archivedAt: new Date() })
      const { io } = await run(tx, ['stage', 'land', 'on', ...why, '--by', admin.email])
      expect(io.output).toContain(
        "Land & title is in no plan, so standard organizations still won't have it.",
      )
    }))

  it('switches a feature off for everyone', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { io } = await run(tx, ['stage', 'sales', 'off', ...why, '--by', admin.email, '--yes'])
      expect(io.questions).toEqual([])
      expect(io.output.at(-1)).toBe('Sales is now off for everyone, including overrides and plans.')
    }))

  it('names missing prerequisites when releasing to one organization, and tells it in plain words', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      const { io } = await run(tx, [
        'override',
        'lekki partners ltd',
        'buyer_portal',
        'on',
        '--reason',
        'Pilot agreement signed',
        '--by',
        admin.email,
      ])
      expect(io.output).toContain(
        "Buyer portal needs Sales and Finance, which aren't available to Lekki Partners Ltd.",
      )
      const [override] = await tx
        .select()
        .from(organizationOverrides)
        .where(eq(organizationOverrides.organizationId, org.id))
      expect(override).toMatchObject({ kind: 'release', key: 'buyer_portal', enabled: true })
      const notices = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'release.override_set'),
          ),
        )
      expect(notices).toHaveLength(1)
      expect(notices[0]).toMatchObject({
        actorName: 'Vento',
        actorUserId: null,
        metadata: { message: 'Vento turned on Buyer portal for your organization' },
      })
      expect(JSON.stringify(notices[0])).not.toContain('Pilot agreement signed')
    }))

  it('moves an organization into the pilot group with one platform and one organization event', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const org = await createOrganization(tx, {
        name: 'Lekki Partners Ltd',
        planKey: 'enterprise',
      })
      const { code } = await run(tx, [
        'group',
        'Lekki Partners Ltd',
        'pilot',
        '--reason',
        'Pilot agreement signed',
        '--by',
        admin.email,
      ])
      expect(code).toBe(0)
      const platform = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.organizationId, org.id))
      expect(platform).toHaveLength(1)
      expect(platform[0]).toMatchObject({
        before: { releaseGroup: 'standard' },
        after: { releaseGroup: 'pilot' },
      })
      const [notice] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'release.group_changed'),
          ),
        )
      expect(notice?.metadata).toEqual({
        message: 'Vento gave your organization early access to new features',
      })
    }))

  it('lists and shows flags without changing anything', () =>
    withRollback(async (tx) => {
      const listed = await run(tx, ['list'])
      expect(listed.io.output.some((l) => l.startsWith('sales.commissions'))).toBe(true)
      const shown = await run(tx, ['show', 'buyer_portal'])
      expect(shown.io.output).toContain('Needs: sales, finance')
    }))
})
