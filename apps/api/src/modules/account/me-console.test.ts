import { describe, expect, it } from 'vitest'
import { passkeysAvailableForUser } from '@/auth/passkey-availability'
import { liveFeatureStore } from '@/platform/feature-store'
import { withRollback } from '@/test/db'
import { createOrganization, createSuperAdmin, setStage } from '@/test/factories'
import { clientAs } from '@/test/router-client'

// The customer side of the Vento console (admin-console plan §4.5, B5).

describe('me.console', () => {
  it('is null for an owner and for a revoked super-admin', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const revoked = await createSuperAdmin(tx, {}, { revoked: true, organization: org })
      for (const user of [org.owner, revoked]) {
        const me = await clientAs(tx, user, { activeOrganizationId: org.id }).client.account.me()
        expect(me.console).toBeNull()
      }
    }))

  it('is set for a super-admin, who is otherwise a member like any other', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ada = await createSuperAdmin(tx, {}, { organization: org, role: 'viewer' })
      const { client } = clientAs(tx, ada, { activeOrganizationId: org.id })
      const me = await client.account.me()
      expect(me).toMatchObject({ console: { twoStepOn: true }, nextStep: 'ready' })
      await expect(
        client.members.updateAccess({
          memberId: org.ownerMemberId,
          roleId: org.roleIds.get('viewer') ?? '',
          entityIds: null,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'permission' } })
    }))

  it('sends a super-admin with no organization to the console, or to two-step first', () =>
    withRollback(async (tx) => {
      const tunde = await createSuperAdmin(tx, { name: 'Tunde Ola' })
      const noTwoStep = await createSuperAdmin(tx, { twoFactorEnabled: false })
      await expect(clientAs(tx, tunde).client.account.me()).resolves.toMatchObject({
        nextStep: 'console',
        organization: null,
      })
      await expect(clientAs(tx, noTwoStep).client.account.me()).resolves.toMatchObject({
        nextStep: 'two_step_setup',
        console: { twoStepOn: false },
      })
    }))

  it('says two-step is required because they are a super-admin', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ada = await createSuperAdmin(tx, {}, { organization: org, role: 'viewer' })
      const me = await clientAs(tx, ada, { activeOrganizationId: org.id }).client.account.me()
      expect(me.twoStepRequiredBy).toEqual({
        reason: 'super_admin',
        organizationName: 'Vento',
        roleName: null,
      })
    }))
})

describe('passkeys for a super-admin with no organization', () => {
  it('are available unless switched off for everyone', () =>
    withRollback(async (tx) => {
      const tunde = await createSuperAdmin(tx)
      const store = liveFeatureStore(tx)
      expect(await passkeysAvailableForUser(tx, store, tunde.id)).toBe(true)
      await setStage(tx, 'platform.passkeys', 'off')
      expect(await passkeysAvailableForUser(tx, store, tunde.id)).toBe(false)
    }))
})
