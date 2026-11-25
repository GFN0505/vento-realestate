import { describe, expect, it } from 'vitest'
import { withRollback } from '@/test/db'
import { createEntity, createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'

describe('account.me nextStep', () => {
  it('sends only the owner to finish setup when there is no entity yet', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const viewer = await createMember(tx, org, { role: 'viewer' })
      const finance = await createMember(tx, org, { role: 'finance' })
      expect((await clientAs(tx, org.owner).client.account.me()).nextStep).toBe('onboarding_entity')
      expect((await clientAs(tx, viewer.user).client.account.me()).nextStep).toBe('ready')
      const withoutTwoStep = { ...finance.user, twoFactorEnabled: false }
      expect((await clientAs(tx, withoutTwoStep).client.account.me()).nextStep).toBe(
        'two_step_setup',
      )
    }))

  it('sends the owner on once the first entity exists', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      expect((await clientAs(tx, org.owner).client.account.me()).nextStep).toBe('ready')
    }))
})
