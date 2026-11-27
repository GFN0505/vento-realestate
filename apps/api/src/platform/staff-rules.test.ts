import { randomUUID } from 'node:crypto'
import { CURRENT_TERMS_VERSION } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { invitations, members, platformAdmins, platformAuditEvents, users } from '@/db/schema'
import { createInvitations } from '@/modules/invitations/invitations.service'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  contextFor,
  createInvitation,
  createOrganization,
  createStaffAccount,
  createSuperAdmin,
  createUser,
  TEST_PASSWORD,
} from '@/test/factories'
import { clientAs, consoleClientAs } from '@/test/router-client'
import { list as listActivity } from './console/activity.service'

// One email, one kind of account (decision 0023, admin-console plan §1b.2).

describe('a staff account on the customer side', () => {
  it("can't set up an organization", () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const { client } = clientAs(tx, ada)
      await expect(
        client.onboarding.createOrganization({ name: 'Ada Homes Ltd', headOfficeState: 'Lagos' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'staff_account' } })
    }))

  it('is refused as an organization member by the database', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ada = await createSuperAdmin(tx)
      await expect(
        tx.insert(members).values({
          organizationId: org.id,
          userId: ada.id,
          roleId: org.roleIds.get('viewer') ?? '',
        }),
      ).rejects.toMatchObject({ cause: { constraint: 'members_refuse_staff' } })
    }))
})

describe('customer invitations to a staff email', () => {
  it('are a row problem naming the email, and nothing is made', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ada = await createSuperAdmin(tx)
      const ctx = await contextFor(tx, org.owner, org)
      await expect(
        createInvitations(ctx, {
          items: [{ email: ada.email, roleId: org.roleIds.get('sales') ?? '' }],
          entityIds: null,
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'staff_account', staffAccounts: [ada.email] },
        message: `${ada.email} is a Vento Real Estate staff account and can't join an organization. Use a different email.`,
      })
      expect(await tx.select().from(invitations).where(eq(invitations.email, ada.email))).toEqual(
        [],
      )
    }))

  it('are refused on resend, previewed as staff, and refused on accept', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const email = uniqueEmail('tunde')
      const { invitation, token } = await createInvitation(tx, org, { role: 'sales', email })
      const staff = await createSuperAdmin(tx, { email })
      const owner = clientAs(tx, org.owner, { activeOrganizationId: org.id }).client
      await expect(owner.invitations.resend({ id: invitation.id })).rejects.toMatchObject({
        data: { reason: 'staff_account' },
      })
      const anonymous = clientAs(tx, null).client
      await expect(anonymous.invitations.preview({ token })).resolves.toMatchObject({
        staffAccount: true,
        hasAccount: true,
      })
      await expect(clientAs(tx, staff).client.invitations.accept({ token })).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'staff_account' },
        message:
          "This email belongs to a Vento Real Estate staff account, so it can't join Vento Homes Ltd. Ask Olumide Bankole to invite a different email.",
      })
      await expect(
        anonymous.invitations.acceptAsNewUser({
          token,
          name: 'Tunde Bello',
          password: TEST_PASSWORD,
          termsVersion: CURRENT_TERMS_VERSION,
        }),
      ).rejects.toMatchObject({ data: { reason: 'staff_account' } })
    }))

  it('preview a customer email as not staff', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const customer = await createUser(tx)
      const { token } = await createInvitation(tx, org, { role: 'sales', email: customer.email })
      await expect(clientAs(tx, null).client.invitations.preview({ token })).resolves.toMatchObject(
        {
          staffAccount: false,
        },
      )
    }))
})

describe('the database keeps the kinds apart', () => {
  it('refuses a super-admin row for a customer account', () =>
    withRollback(async (tx) => {
      const customer = await createUser(tx)
      await expect(
        tx.insert(platformAdmins).values({ userId: customer.id, reason: 'test' }),
      ).rejects.toMatchObject({ cause: { constraint: 'platform_admins_staff_only' } })
    }))

  it("refuses to change an account's kind", () =>
    withRollback(async (tx) => {
      const customer = await createUser(tx)
      await expect(
        tx.update(users).set({ accountKind: 'staff' }).where(eq(users.id, customer.id)),
      ).rejects.toMatchObject({ cause: { constraint: 'users_account_kind_fixed' } })
    }))
})

describe('resetting a super-admin’s two-step in the console', () => {
  it('ends their sessions, needs a new password, emails them and the others, and asks for the link', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const other = await createSuperAdmin(tx, { name: 'Bola Ade' })
      const tunde = await createStaffAccount(tx, { name: 'Tunde Bello' })
      const sent: unknown[] = []
      const { client, mailer } = consoleClientAs(tx, ada, {
        authApi: { requestPasswordReset: async (input: never) => sent.push(input) },
      })
      const preview = await client.console.superAdmins.resetTwoStep.preview({ userId: tunde.id })
      await client.console.superAdmins.resetTwoStep.apply({
        userId: tunde.id,
        expected: preview.expected,
        reason: 'Lost phone',
        idempotencyKey: randomUUID(),
      })
      const [row] = await tx.select().from(users).where(eq(users.id, tunde.id))
      expect(row).toMatchObject({
        twoFactorEnabled: false,
        twoStepSetupRequired: true,
        passwordResetRequired: true,
      })
      expect(sent).toEqual([{ body: { email: tunde.email, redirectTo: '/reset-password' } }])
      expect(mailer.to(tunde.email)[0]?.tag).toBe('security_alert')
      expect(mailer.to(other.email)[0]?.subject).toBe("Ada Okafor reset Tunde Bello's two-step")
      // Until they set it up again, the console asks for two-step.
      await expect(
        consoleClientAs(tx, row ?? tunde).client.console.plans.list(),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', data: { reason: 'console_two_step_required' } })
    }))

  it('refuses your own row', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, ada)
      await expect(
        client.console.superAdmins.resetTwoStep.preview({ userId: ada.id }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: "You can't reset your own two-step. Ask another super-admin.",
      })
    }))
})

describe('a staff person’s own account events', () => {
  it('go to the platform trail as account events, never onto Activity', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createStaffAccount(tx, { name: 'Tunde Bello' })
      const { client } = consoleClientAs(tx, ada)
      await client.console.superAdmins.resetTwoStep.apply({
        userId: tunde.id,
        expected: {},
        reason: 'Lost phone',
        idempotencyKey: randomUUID(),
      })
      const own = await tx
        .select({ action: platformAuditEvents.action, channel: platformAuditEvents.channel })
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.targetKey, tunde.id))
      expect(own).toContainEqual({ action: 'two_step.reset', channel: 'account' })
      const activity = await listActivity(tx, { pageSize: 100 })
      expect(activity.items.map((i) => i.summary)).not.toContain('two_step.reset')
      expect(activity.items.every((i) => i.channel !== ('account' as string))).toBe(true)
    }))
})
