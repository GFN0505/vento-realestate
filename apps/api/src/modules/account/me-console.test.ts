import { describe, expect, it } from 'vitest'
import { passkeysAvailableForUser, passkeysAvailableHere } from '@/auth/passkey-availability'
import { liveFeatureStore } from '@/platform/feature-store'
import { withRollback } from '@/test/db'
import {
  createOrganization,
  createStaffAccount,
  createSuperAdmin,
  setStage,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'

// What `account.me` tells staff and customers (admin-console plan §4.5 and §1b.6).

describe('me.console', () => {
  it('is null for an owner and for a revoked super-admin', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const revoked = await createSuperAdmin(tx, {}, { revoked: true })
      const ownerMe = await clientAs(tx, org.owner, {
        activeOrganizationId: org.id,
      }).client.account.me()
      expect(ownerMe.console).toBeNull()
      expect((await clientAs(tx, revoked).client.account.me()).console).toBeNull()
    }))

  it('sends an active super-admin to the console, and one without two-step to set it up', () =>
    withRollback(async (tx) => {
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Ola' })
      const noTwoStep = await createSuperAdmin(tx, { twoFactorEnabled: false })
      await expect(clientAs(tx, tunde).client.account.me()).resolves.toMatchObject({
        nextStep: 'console',
        organization: null,
        console: { twoStepOn: true },
      })
      await expect(clientAs(tx, noTwoStep).client.account.me()).resolves.toMatchObject({
        nextStep: 'two_step_setup',
        console: { twoStepOn: false },
      })
    }))

  it('never sends a staff account to onboarding, even mid-way through its sign-up', () =>
    withRollback(async (tx) => {
      const joining = await createStaffAccount(tx, { state: 'joining' })
      await expect(clientAs(tx, joining).client.account.me()).resolves.toMatchObject({
        nextStep: 'two_step_setup',
        console: null,
      })
    }))

  it('says two-step is required for Vento Real Estate staff', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const me = await clientAs(tx, ada).client.account.me()
      expect(me.twoStepRequiredBy).toEqual({
        reason: 'super_admin',
        organizationName: 'Vento Real Estate',
        roleName: null,
      })
    }))
})

describe('passkeys for a super-admin (no organization)', () => {
  it('are available unless switched off for everyone', () =>
    withRollback(async (tx) => {
      const tunde = await createSuperAdmin(tx)
      const store = liveFeatureStore(tx)
      expect(await passkeysAvailableForUser(tx, store, tunde.id)).toBe(true)
      await setStage(tx, 'platform.passkeys', 'off')
      expect(await passkeysAvailableForUser(tx, store, tunde.id)).toBe(false)
    }))

  it('are available on My account, where there is no organization', () =>
    withRollback(async (tx) => {
      const tunde = await createSuperAdmin(tx)
      const store = liveFeatureStore(tx)
      const session = { userId: tunde.id, activeOrganizationId: null }
      expect(await passkeysAvailableHere(tx, store, session)).toBe(true)
    }))

  it('stay unavailable to a customer with no organization', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const store = liveFeatureStore(tx)
      const session = { userId: org.owner.id, activeOrganizationId: null }
      expect(await passkeysAvailableHere(tx, store, session)).toBe(false)
    }))
})
