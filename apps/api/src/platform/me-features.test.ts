import { SYSTEM_ROLE_KEYS } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { countingDb } from '@/test/counting-db'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, setOverride, setStage } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { staticFeatureStore } from './feature-store'
import { findPlanVersion } from './operations/common'
import { startTrial } from './operations/plans'
import { loadSnapshot } from './snapshot'

const ACTOR = { userId: null, name: 'Test', channel: 'command' as const, operator: null }

describe('account.me features', () => {
  it('gives an internal organization every flag at internal, all as early access', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { releaseGroup: 'internal' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const me = await client.account.me()
      expect(me.organization?.internal).toBe(true)
      expect(me.features).toContainEqual({ key: 'land', earlyAccess: true })
      expect(me.features.every((f) => f.earlyAccess)).toBe(true)
    }))

  it('lists only what a Starter organization has: released and in the plan', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await setStage(tx, 'land', 'on')
      await setStage(tx, 'facility', 'on') // released, but Estates isn't in Starter
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const me = await client.account.me()
      expect(me.organization?.internal).toBe(false)
      expect(me.features).toEqual([{ key: 'land', earlyAccess: false }])
    }))

  it('marks a feature reached through a release override as early access', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await setOverride(tx, org, { kind: 'release', key: 'land', enabled: true })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      expect((await client.account.me()).features).toEqual([{ key: 'land', earlyAccess: true }])
    }))

  it.each(SYSTEM_ROLE_KEYS.filter((r) => r !== 'owner'))('gives a %s no plan block', (role) =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      const { user } = await createMember(tx, org, { role })
      const { client } = clientAs(tx, user, { activeOrganizationId: org.id })
      expect((await client.account.me()).plan).toBeNull()
    }),
  )
})

describe('account.me plan (owners)', () => {
  it('shows the plan, limits with use, and the contact', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await createMember(tx, org, { role: 'sales' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const { plan } = await client.account.me()
      expect(plan).toMatchObject({
        name: 'Starter',
        limits: [
          { key: 'entities', included: 2, used: 0 },
          { key: 'members', included: 10, used: 2 },
        ],
        aiBudget: null,
        trial: null,
        contact: { email: expect.any(String), whatsapp: null },
      })
    }))

  it('hints the lowest plan for a feature released but not included', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await setStage(tx, 'projects', 'on')
      await setStage(tx, 'sales', 'on')
      await setOverride(tx, org, { kind: 'release', key: 'sales.commissions', enabled: true })
      await setOverride(tx, org, { kind: 'release', key: 'ai.ask', enabled: true })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const { plan } = await client.account.me()
      expect(plan?.upgradeHints).toEqual([
        { key: 'sales.commissions', label: 'Commissions', availableOn: 'Growth' },
        { key: 'ai.ask', label: 'Ask Vento', availableOn: 'the AI add-on' },
      ])
    }))

  it('gives no hint while a prerequisite is unavailable (Sales not released yet)', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await setOverride(tx, org, { kind: 'release', key: 'sales.commissions', enabled: true })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      expect((await client.account.me()).plan?.upgradeHints).toEqual([])
    }))

  it('gives no hint for a feature that is not released to the organization', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      expect((await client.account.me()).plan?.upgradeHints).toEqual([])
    }))

  it('shows a live trial with what goes when it ends, and no early-access tag', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { name: 'Lekki Partners Ltd', planKey: 'starter' })
      await setStage(tx, 'analytics', 'on')
      await setStage(tx, 'analytics.board_pack', 'on')
      const target = await findPlanVersion(tx, 'enterprise')
      await startTrial(
        tx,
        ACTOR,
        {
          organization: { id: org.id, name: org.name },
          target,
          days: 30,
          reason: 'Board pack trial',
        },
        new Date('2026-12-03T09:00:00Z'),
      )
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const me = await client.account.me()
      expect(me.plan?.trial).toEqual({
        planName: 'Enterprise',
        endsOn: '2027-01-02',
        losing: ['Board pack'],
      })
      expect(me.features).toContainEqual({ key: 'analytics.board_pack', earlyAccess: false })
    }))

  it('never sends stages, other plans or other organizations', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      await createOrganization(tx, { name: 'Secret Developer Ltd', planKey: 'growth' })
      await setStage(tx, 'land', 'pilot')
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      const json = JSON.stringify(await client.account.me())
      expect(json).not.toMatch(/"stage"|pilot|Secret Developer|"members":40|sortOrder|price/)
    }))

  // 3a already gave owners one more (the first-entity check); the plan block adds two counts.
  it('costs an owner at most two more queries than in 3a: the limit counts', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { planKey: 'starter' })
      const { user } = await createMember(tx, org, { role: 'sales' })
      const store = staticFeatureStore(await loadSnapshot(tx))
      const count = async (person: typeof user) => {
        const { db, calls } = countingDb(tx)
        await clientAs(db, person, {
          activeOrganizationId: org.id,
          features: store,
        }).client.account.me()
        return calls.length
      }
      const member = await count(user)
      const owner = await count(org.owner)
      expect(owner - member).toBeLessThanOrEqual(1 + 2)
    }))
})
