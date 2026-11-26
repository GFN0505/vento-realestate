import { CURRENT_TERMS_VERSION, createInvitationsInput } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { invitations, members, sessions, users } from '@/db/schema'
import { browser, testApp } from '@/test/auth-client'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  contextFor,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
  createSession,
  createUser,
  TEST_PASSWORD,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import {
  acceptInvitation,
  createInvitations,
  previewInvitation,
  resendInvitation,
  withdrawInvitation,
} from './invitations.service'

const DAY = 24 * 3600_000

describe('invitations', () => {
  it('invites up to 20 people and emails each one the details', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const ctx = await contextFor(tx, org.owner, org)
      const finance = org.roleIds.get('finance') ?? ''
      const items = Array.from({ length: 20 }, () => ({ email: uniqueEmail(), roleId: finance }))
      const result = await createInvitations(ctx, { items, entityIds: [parkview.id] })
      expect(result).toMatchObject({ sent: 20, notice: 'Invitations sent to 20 people' })
      const email = result.emails[0]
      expect(email?.subject).toBe('Olumide Bankole invited you to Vento Homes Ltd on Vento')
      expect(email?.text).toContain('as Finance')
      expect(email?.text).toContain('Access: Parkview Residences SPV Ltd')
      expect(email?.text).toContain('Can approve: Sales & CRM, Finance, HR & payroll')
      expect(email?.text).toMatch(/expires on \d{1,2} \w{3} \d{4}/)
    }))

  it('refuses 21 in one go', () => {
    const items = Array.from({ length: 21 }, () => ({
      email: uniqueEmail(),
      roleId: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f',
    }))
    const result = createInvitationsInput.safeParse({ items, entityIds: null })
    expect(result.error?.issues[0]?.message).toBe('Invite up to 20 people at a time')
  })

  it('refuses someone who is already a member, naming them', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const aisha = await createMember(tx, org, { role: 'finance' })
      const ctx = await contextFor(tx, org.owner, org)
      await expect(
        createInvitations(ctx, {
          items: [{ email: aisha.user.email, roleId: org.roleIds.get('sales') ?? '' }],
          entityIds: null,
        }),
      ).rejects.toMatchObject({
        message: `${aisha.user.email} is already a member of Vento Homes Ltd.`,
      })
    }))

  it("won't let an admin invite an owner", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const admin = await createMember(tx, org, { role: 'admin' })
      await expect(
        createInvitations(await contextFor(tx, admin.user, org), {
          items: [{ email: uniqueEmail(), roleId: org.roleIds.get('owner') ?? '' }],
          entityIds: null,
        }),
      ).rejects.toMatchObject({ data: { reason: 'owner_only' } })
    }))

  it('shows an expired invitation with the spec copy and refuses it', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { token } = await createInvitation(tx, org, {
        role: 'finance',
        expiresAt: new Date(Date.now() - DAY),
      })
      expect((await previewInvitation(tx, token)).status).toBe('expired')
      const user = await createUser(tx)
      await tx
        .update(invitations)
        .set({ email: user.email })
        .where(eq(invitations.organizationId, org.id))
      await expect(
        acceptInvitation(
          tx,
          { user, session: { id: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f' } },
          token,
        ),
      ).rejects.toMatchObject({
        message: expect.stringMatching(
          /^This invitation expired on \d{1,2} \w{3} \d{4}\. Ask Olumide Bankole to send a new one\.$/,
        ),
        data: { reason: 'invitation_expired' },
      })
    }))

  it('resending replaces the link and gives a fresh 7 days', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { invitation, token } = await createInvitation(tx, org, {
        role: 'sales',
        expiresAt: new Date(Date.now() + DAY),
      })
      const ctx = await contextFor(tx, org.owner, org)
      await resendInvitation(ctx, invitation.id)
      await expect(previewInvitation(tx, token)).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const [row] = await tx.select().from(invitations).where(eq(invitations.id, invitation.id))
      expect((row?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(6.9 * DAY)
    }))

  it('keeps a limited admin within their own entities when inviting', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const victoria = await createEntity(tx, org, { name: 'Victoria Gardens Dev. Ltd' })
      const admin = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const ctx = await contextFor(tx, admin.user, org)
      const invite = (entityIds: string[] | null) =>
        createInvitations(ctx, {
          items: [{ email: uniqueEmail(), roleId: org.roleIds.get('sales') ?? '' }],
          entityIds,
        })
      await expect(invite(null)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message:
          'You can only give access to the entities you can see. Choose them instead of all entities.',
        data: { reason: 'entity_limit' },
      })
      await expect(invite([victoria.id])).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(invite([parkview.id])).resolves.toMatchObject({ sent: 1 })
    }))

  it('refuses to resend an old invitation while a newer one is live', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const email = uniqueEmail()
      const old = await createInvitation(tx, org, { role: 'sales', email, status: 'expired' })
      await createInvitation(tx, org, { role: 'sales', email })
      await expect(
        resendInvitation(await contextFor(tx, org.owner, org), old.invitation.id),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: `${email} already has an invitation. Resend it instead.`,
        data: { reason: 'already_invited' },
      })
    }))

  it('resends an old invitation when the newer one has lapsed too', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const email = uniqueEmail()
      const old = await createInvitation(tx, org, { role: 'sales', email, status: 'expired' })
      await createInvitation(tx, org, {
        role: 'sales',
        email,
        expiresAt: new Date(Date.now() - DAY),
      })
      const result = await resendInvitation(await contextFor(tx, org.owner, org), old.invitation.id)
      expect(result.notice).toBe(`Invitation sent again to ${email}`)
    }))

  it('shows a withdrawn invitation as withdrawn', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { invitation, token } = await createInvitation(tx, org, { role: 'sales' })
      expect(await withdrawInvitation(await contextFor(tx, org.owner, org), invitation.id)).toEqual(
        { notice: 'Invitation withdrawn' },
      )
      expect((await previewInvitation(tx, token)).status).toBe('withdrawn')
    }))

  it('previews what the role can approve, entities and two-step', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { token } = await createInvitation(tx, org, { role: 'finance' })
      expect(await previewInvitation(tx, token)).toMatchObject({
        organizationName: 'Vento Homes Ltd',
        inviterName: 'Olumide Bankole',
        roleName: 'Finance',
        entities: 'all',
        canApprove: ['Sales & CRM', 'Finance', 'HR & payroll'],
        twoStepRequired: true,
        hasAccount: false,
      })
    }))

  it('lets an existing Vento user accept and belong to both organizations', () =>
    withRollback(async (tx) => {
      const first = await createOrganization(tx)
      const aisha = await createMember(tx, first, { role: 'sales' })
      const second = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      const { token } = await createInvitation(tx, second, {
        role: 'viewer',
        email: aisha.user.email,
      })
      const result = await acceptInvitation(
        tx,
        { user: aisha.user, session: { id: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f' } },
        token,
      )
      expect(result).toEqual({ nextStep: 'ready' })
      const rows = await tx.select().from(members).where(eq(members.userId, aisha.user.id))
      expect(rows.map((r) => r.organizationId).sort()).toEqual([first.id, second.id].sort())
      const { client } = clientAs(tx, aisha.user, { activeOrganizationId: second.id })
      expect((await client.account.me()).organization?.name).toBe('Lekki Partners Ltd')
    }))

  it('moves an existing user into the new organization, for this session and the next sign-in', () =>
    withRollback(async (tx) => {
      const first = await createOrganization(tx)
      const tunde = await createMember(tx, first, { role: 'viewer', name: 'Tunde Ola' })
      const second = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      await createEntity(tx, second)
      const { token } = await createInvitation(tx, second, {
        role: 'sales',
        email: tunde.user.email,
      })
      const session = await createSession(tx, tunde.user, { activeOrganizationId: first.id })
      const { client } = clientAs(tx, tunde.user, {
        sessionId: session.id,
        activeOrganizationId: first.id,
      })

      expect(await client.invitations.accept({ token })).toEqual({ nextStep: 'ready' })

      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.activeOrganizationId).toBe(second.id)
      const [user] = await tx.select().from(users).where(eq(users.id, tunde.user.id))
      expect(user?.lastActiveOrganizationId).toBe(second.id)
    }))

  it('refuses when signed in as a different email', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { invitation, token } = await createInvitation(tx, org, { role: 'sales' })
      const someoneElse = await createUser(tx)
      await expect(
        acceptInvitation(
          tx,
          { user: someoneElse, session: { id: '01936f1e-8b2a-7c3d-9e4f-5a6b7c8d9e0f' } },
          token,
        ),
      ).rejects.toMatchObject({
        message: `This invitation is for ${invitation.email}`,
        data: { reason: 'invitation_email_mismatch' },
      })
    }))
})

describe('accepting as a new person (HTTP)', () => {
  async function invite(role: 'finance' | 'viewer' = 'finance') {
    const org = await createOrganization(db, { name: `Accept Test ${Date.now()}` })
    await createEntity(db, org)
    return { org, ...(await createInvitation(db, org, { role })) }
  }

  it('creates the account, records the terms, signs in and asks for two-step', async () => {
    const { app } = testApp()
    const { token, invitation } = await invite('finance')
    const b = browser(app)
    const res = await b.rpc('invitations/acceptAsNewUser', {
      token,
      name: 'Aisha Bello',
      password: TEST_PASSWORD,
      termsVersion: CURRENT_TERMS_VERSION,
    })
    expect(res.body).toEqual({ nextStep: 'two_step_setup' })
    const me = await b.rpc('account/me')
    expect(me.body).toMatchObject({
      nextStep: 'two_step_setup',
      member: { role: { key: 'finance' } },
    })
    const [user] = await db.select().from(users).where(eq(users.email, invitation.email))
    expect(user).toMatchObject({ termsVersion: CURRENT_TERMS_VERSION, emailVerified: true })
    expect(user?.termsAcceptedAt).toBeInstanceOf(Date)
  })

  it('answers account_exists when the email already has an account', async () => {
    const { app } = testApp()
    const { token, invitation } = await invite()
    await createUser(db, { email: invitation.email })
    const res = await browser(app).rpc('invitations/acceptAsNewUser', {
      token,
      name: 'Aisha Bello',
      password: TEST_PASSWORD,
      termsVersion: CURRENT_TERMS_VERSION,
    })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ data: { reason: 'account_exists' } })
  })

  it('explains a password without a number on the password field', async () => {
    const { app } = testApp()
    const { token } = await invite()
    const res = await browser(app).rpc('invitations/acceptAsNewUser', {
      token,
      name: 'Aisha Bello',
      password: 'No-number-here!',
      termsVersion: CURRENT_TERMS_VERSION,
    })
    expect(res.status).toBe(400)
    // The shared zod schema catches every local rule before the service runs.
    expect(res.body).toMatchObject({
      data: { issues: [{ message: 'Add a number', path: ['password'] }] },
    })
  })
})

describe('inviting the same email at the same moment', () => {
  it('answers already_invited to the second request, not a server error', async () => {
    const org = await createOrganization(db, { name: `Race Test ${Date.now()}` })
    const email = uniqueEmail()
    const roleId = org.roleIds.get('sales') ?? ''
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    // The first invite is written but not yet committed when the second one checks.
    const first = db.transaction(async (tx) => {
      await createInvitations(await contextFor(tx, org.owner, org), {
        items: [{ email, roleId }],
        entityIds: null,
      })
      await held
    })
    await new Promise((r) => setTimeout(r, 100))
    const second = createInvitations(await contextFor(db, org.owner, org), {
      items: [{ email, roleId }],
      entityIds: null,
    })
    await new Promise((r) => setTimeout(r, 100))
    release()
    await first
    await expect(second).rejects.toMatchObject({
      code: 'CONFLICT',
      data: { reason: 'already_invited' },
    })
  })
})

describe('accepting as a new person: edge cases', () => {
  it('sends them to sign in when the automatic sign-in fails after joining', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      const { token, invitation } = await createInvitation(tx, org, { role: 'viewer' })
      const { client } = clientAs(tx, null, {
        authApi: {
          signInEmail: async () => {
            throw new Error('database blip')
          },
        },
      })
      const result = await client.invitations.acceptAsNewUser({
        token,
        name: 'Aisha Bello',
        password: TEST_PASSWORD,
        termsVersion: CURRENT_TERMS_VERSION,
      })
      expect(result).toEqual({ nextStep: 'sign_in' })
      const [joined] = await tx.select().from(users).where(eq(users.email, invitation.email))
      expect(joined).toBeDefined()
    }))
})
