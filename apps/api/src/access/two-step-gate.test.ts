import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { organizations, sessions } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, createSession } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { type TwoStepGateInput, twoStepGate } from './two-step-gate'

const DAY = 24 * 3600_000
const now = new Date('2026-11-26T10:00:00Z')
const since = new Date('2026-11-24T10:00:00Z')
const before = new Date('2026-11-23T10:00:00Z')
const after = new Date('2026-11-25T10:00:00Z')

const base: TwoStepGateInput = {
  twoFactorEnabled: false,
  twoStepSetupRequired: false,
  roleRequiresTwoStep: false,
  organization: { required: false, since: null },
  enteredAt: before,
}
const orgOn = { required: true, since }

describe('two-step gate', () => {
  it.each<[string, Partial<TwoStepGateInput>, Date, string]>([
    ['two-step on', { twoFactorEnabled: true, roleRequiresTwoStep: true }, now, 'ok'],
    ['nothing requires it', {}, now, 'ok'],
    ['the role requires it', { roleRequiresTwoStep: true }, now, 'required'],
    ['an admin reset it', { twoStepSetupRequired: true }, now, 'required'],
    ['org on, already in when it was turned on', { organization: orgOn }, now, 'grace'],
    [
      'org on, entered after it was turned on',
      { organization: orgOn, enteredAt: after },
      now,
      'required',
    ],
    [
      'org on, 7 days passed',
      { organization: orgOn },
      new Date(since.getTime() + 7 * DAY),
      'required',
    ],
    ['org on, no session yet (joining)', { organization: orgOn, enteredAt: null }, now, 'required'],
    ['org on, two-step on', { organization: orgOn, twoFactorEnabled: true }, now, 'ok'],
  ])('%s → %s', (_name, input, at, kind) => {
    expect(twoStepGate({ ...base, ...input }, at).kind).toBe(kind)
  })

  it('gives the grace deadline 7 days after the setting was turned on', () => {
    expect(twoStepGate({ ...base, organization: orgOn }, now)).toEqual({
      kind: 'grace',
      deadline: new Date(since.getTime() + 7 * DAY),
    })
  })
})

async function requireForEveryone(tx: DbOrTx, organizationId: string, at: Date) {
  await tx
    .update(organizations)
    .set({ twoStepRequiredForEveryone: true, twoStepRequiredChangedAt: at })
    .where(eq(organizations.id, organizationId))
}

describe('two-step gate in the middleware', () => {
  it('lets a member in grace keep working, with the deadline on me', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'sales' })
      await requireForEveryone(tx, org.id, new Date(Date.now() - DAY))
      const { client } = clientAs(tx, user, {
        activeOrganizationId: org.id,
        session: { organizationEnteredAt: new Date(Date.now() - 2 * DAY) },
      })
      await expect(client.organization.get()).resolves.toMatchObject({ id: org.id })
      const me = await client.account.me()
      expect(me.nextStep).toBe('ready')
      expect(Date.parse(me.twoStepSetupBy ?? '')).toBeGreaterThan(Date.now() + 5 * DAY)
      expect(me.twoStepRequiredBy).toEqual({
        reason: 'organization',
        organizationName: org.name,
        roleName: null,
      })
    }))

  it('refuses once 7 days have passed', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'sales' })
      await requireForEveryone(tx, org.id, new Date(Date.now() - 8 * DAY))
      const { client } = clientAs(tx, user, {
        activeOrganizationId: org.id,
        session: { organizationEnteredAt: new Date(Date.now() - 9 * DAY) },
      })
      await expect(client.organization.get()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'two_step_setup_required' },
      })
    }))

  it('refuses a session that signed in after it was turned on', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { user } = await createMember(tx, org, { role: 'sales' })
      await requireForEveryone(tx, org.id, new Date(Date.now() - DAY))
      const { client } = clientAs(tx, user, { activeOrganizationId: org.id })
      await expect(client.organization.get()).rejects.toMatchObject({
        data: { reason: 'two_step_setup_required' },
      })
      expect((await client.account.me()).nextStep).toBe('two_step_setup')
    }))

  it('sends a switch into a requiring organization to setup, and leaves the other one open', () =>
    withRollback(async (tx) => {
      const lekki = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      const vento = await createOrganization(tx, { name: 'Vento Homes Ltd' })
      const { user } = await createMember(tx, lekki, { role: 'sales' })
      await createMember(tx, vento, { role: 'sales', user })
      await requireForEveryone(tx, vento.id, new Date(Date.now() - DAY))
      const session = await createSession(tx, user, {
        activeOrganizationId: lekki.id,
        organizationEnteredAt: new Date(Date.now() - 2 * DAY),
      })
      const inLekki = clientAs(tx, user, {
        sessionId: session.id,
        activeOrganizationId: lekki.id,
        session: { organizationEnteredAt: new Date(Date.now() - 2 * DAY) },
      }).client
      await expect(inLekki.organization.get()).resolves.toMatchObject({ id: lekki.id })
      const switched = await inLekki.account.switchOrganization({ organizationId: vento.id })
      expect(switched.nextStep).toBe('two_step_setup')
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.organizationEnteredAt?.getTime()).toBeGreaterThan(Date.now() - 60_000)
    }))
})
