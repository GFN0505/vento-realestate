import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditEvents, organizationAddOns, platformAuditEvents } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  addAddOnRow,
  createOrganization,
  createSuperAdmin,
  createUser,
  setStage,
  type TestUser,
} from '@/test/factories'
import type { PlatformActor } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { FEATURE_RECORD_COUNTERS } from '../usage'
import { findPlanVersion } from './common'
import { changeAddOnBudget, previewAddOnBudget, previewAssign, previewPublish } from './plans'
import { previewStage, setStage as setStageOperation } from './release'
import { previewGrant } from './super-admin'

const consoleActor = (user: TestUser): PlatformActor => ({
  userId: user.id,
  name: user.name,
  channel: 'console',
  operator: 'console · Chrome on Mac · 102.89.34.x',
})

afterEach(() => {
  delete FEATURE_RECORD_COUNTERS['sales.leads']
})

describe('the before-state check', () => {
  it('refuses a stage change previewed before someone else moved it, naming them', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Ola' })
      const { expected } = await previewStage(tx, 'documents', 'pilot')
      await setStageOperation(tx, consoleActor(tunde), {
        key: 'documents',
        stage: 'on',
        reason: 'Ready for everyone',
      })
      const attempt = setStageOperation(tx, consoleActor(ada), {
        key: 'documents',
        stage: 'pilot',
        reason: 'Pilot first',
        expected,
      })
      await expect(attempt).rejects.toMatchObject({
        kind: 'stale',
        message:
          'Tunde Ola moved Documents to on since you opened this. Check the preview and try again.',
        extra: { changedByName: 'Tunde Ola' },
      })
    }))

  it('records the channel and operator of a console change', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const { expected } = await previewStage(tx, 'documents', 'pilot')
      await setStageOperation(tx, consoleActor(ada), {
        key: 'documents',
        stage: 'pilot',
        reason: 'Pilot first',
        expected,
      })
      const [event] = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.actorUserId, ada.id))
      expect(event).toMatchObject({
        channel: 'console',
        operator: 'console · Chrome on Mac · 102.89.34.x',
        metadata: { done: 'Documents is now at pilot. Takes effect within 30 seconds.' },
      })
    }))

  it('refuses a stage it is already at, in the preview', () =>
    withRollback(async (tx) => {
      await expect(previewStage(tx, 'documents', 'internal')).rejects.toBeInstanceOf(PlatformError)
    }))
})

describe('changing the AI budget', () => {
  it('closes the add-on row, starts a new one, and writes one event and one notice', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'growth' })
      await addAddOnRow(tx, org)
      const organization = { id: org.id, name: org.name }
      const preview = await previewAddOnBudget(tx, organization, 'ai', '250000.00')
      expect(preview.lines[0]?.text).toBe(
        "Lekki Partners Ltd's AI budget changes from ₦150,000 to ₦250,000 a month.",
      )
      const done = await changeAddOnBudget(tx, consoleActor(ada), {
        organization,
        addOn: 'ai',
        budget: '250000.00',
        reason: 'Bigger pilot',
        expected: preview.expected,
      })
      expect(done).toBe(
        "Lekki Partners Ltd's AI budget is now ₦250,000 a month. Takes effect at once.",
      )
      const rows = await tx
        .select()
        .from(organizationAddOns)
        .where(eq(organizationAddOns.organizationId, org.id))
      expect(rows.map((r) => [r.cancelledAt === null, r.limitIncreases])).toEqual(
        expect.arrayContaining([
          [false, { ai_budget: '150000.00' }],
          [true, { ai_budget: '250000.00' }],
        ]),
      )
      const events = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.organizationId, org.id))
      expect(events.map((e) => e.action)).toEqual(['plan.add_on_changed'])
      const notices = await tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'plan.add_on_changed'),
          ),
        )
      expect(notices).toEqual([
        { metadata: { message: 'Vento changed your AI budget to ₦250,000 a month' } },
      ])
    }))

  it('refuses the budget it already has', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'growth' })
      await addAddOnRow(tx, org)
      await expect(
        previewAddOnBudget(tx, { id: org.id, name: org.name }, 'ai', '150000.00'),
      ).rejects.toMatchObject({ message: 'AI is already ₦150,000 a month.' })
    }))
})

describe('previews', () => {
  it('name the features an organization loses and the records that drop out of view', () =>
    withRollback(async (tx) => {
      for (const key of ['projects', 'sales', 'sales.leads']) await setStage(tx, key, 'on')
      FEATURE_RECORD_COUNTERS['sales.leads'] = async () => 214
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'growth' })
      const starter = await findPlanVersion(tx, 'starter')
      const { lines, expected } = await previewAssign(tx, { id: org.id, name: org.name }, starter)
      expect(lines.map((l) => [l.tone, l.text])).toEqual(
        expect.arrayContaining([
          ['warning', 'Loses Leads.'],
          [
            'danger',
            'Lekki Partners Ltd has 214 records in Leads. Its members will stop seeing them.',
          ],
        ]),
      )
      expect(expected.planVersionId).toBe((await findPlanVersion(tx, 'growth')).versionId)
    }))

  it('show what a new plan version adds and removes, and that nobody moves', () =>
    withRollback(async (tx) => {
      const growth = await findPlanVersion(tx, 'growth')
      const features = growth.features.filter((k) => k !== 'hr').concat('finance.tax') as never[]
      const { lines, expected } = await previewPublish(tx, {
        key: 'growth',
        name: 'Growth',
        sortOrder: growth.sortOrder,
        features,
        limits: { ...(growth.limits as object), projects: 8, ai_budget: '0' },
      })
      const text = lines.map((l) => l.text)
      expect(text).toContain('Adds Tax summary.')
      expect(text).toContain('Removes HR & payroll.')
      expect(text).toContain('Active projects: 5 → 8.')
      expect(text.at(-1)).toMatch(/stay on Growth v\d+ or earlier until you move them\.$/)
      expect(expected.latestVersion).toBe(growth.version)
    }))

  it('warn when a grant makes four super-admins', () =>
    withRollback(async (tx) => {
      for (let i = 0; i < 3; i++) await createSuperAdmin(tx)
      const candidate = await createUser(tx, { twoFactorEnabled: true })
      const { lines } = await previewGrant(tx, { email: candidate.email })
      expect(lines.at(-1)).toMatchObject({
        tone: 'warning',
        text: expect.stringMatching(/second approver/),
      })
    }))
})
