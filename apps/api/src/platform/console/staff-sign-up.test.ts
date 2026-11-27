import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createApp } from '@/app'
import { createAuth } from '@/auth/auth'
import { db } from '@/db/client'
import {
  platformAdmins,
  platformAuditEvents,
  signInLocks,
  staffInvitations,
  users,
} from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { createRateLimiter } from '@/lib/rate-limit'
import { browser, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { createStaffInvitation, createSuperAdmin, TEST_PASSWORD } from '@/test/factories'
import { joinAsStaff, signIn } from '@/test/flows'

// The staff sign-up over HTTP, through Better Auth (admin-console plan §1b.5). These commit, so
// each test makes its own people and cleans up the invitations it leaves open.

async function closeInvitation(id: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_admins'))`)
    await tx
      .update(staffInvitations)
      .set({ status: 'withdrawn', respondedAt: new Date(), userId: null, startedAt: null })
      .where(and(eq(staffInvitations.id, id), eq(staffInvitations.status, 'pending')))
  })
}

describe('joining as a super-admin', () => {
  it('makes a super-admin only once the code is verified, and lands on the console', async () => {
    const { app } = testApp()
    const b = browser(app)
    const { email, userId, invitationId } = await joinAsStaff(b, 'Tunde Bello')
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user).toMatchObject({ accountKind: 'staff', emailVerified: true, termsVersion: null })
    const [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, userId))
    expect(admin?.revokedAt).toBeNull()
    const [invitation] = await db
      .select()
      .from(staffInvitations)
      .where(eq(staffInvitations.id, invitationId))
    expect(invitation?.status).toBe('accepted')
    const events = await db
      .select({
        action: platformAuditEvents.action,
        channel: platformAuditEvents.channel,
        actor: platformAuditEvents.actorUserId,
      })
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetKey, invitationId))
    expect(events).toEqual([{ action: 'superadmin.joined', channel: 'console', actor: userId }])
    // Their own account trail starts with two-step set up, on the platform trail.
    const own = await db
      .select({ action: platformAuditEvents.action })
      .from(platformAuditEvents)
      .where(
        and(eq(platformAuditEvents.targetKey, userId), eq(platformAuditEvents.channel, 'account')),
      )
    expect(own.map((e) => e.action)).toContain('two_step.enabled')
    const me = await b.rpc('account/me')
    expect(me.body).toMatchObject({ nextStep: 'console', organization: null, user: { email } })
  })

  it('is not a super-admin before the code, and resumes at two-step with the password', async () => {
    const { app } = testApp()
    const email = uniqueEmail('resume')
    const invitation = await createStaffInvitation(db, { email })
    try {
      const first = browser(app)
      const started = await first.rpc('console/join/start', {
        token: invitation.token,
        name: 'Kemi Ojo',
        password: TEST_PASSWORD,
      })
      expect(started.body).toEqual({ next: 'two_step' })
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
      expect(
        await db
          .select()
          .from(platformAdmins)
          .where(eq(platformAdmins.userId, user?.id ?? '')),
      ).toEqual([])
      const again = browser(app)
      expect((await again.rpc('console/join/get', { token: invitation.token })).body).toMatchObject(
        {
          resume: true,
        },
      )
      const wrong = await again.rpc('console/join/start', {
        token: invitation.token,
        password: 'Not-the-password-1',
      })
      expect(wrong.status).toBe(400)
      const right = await again.rpc('console/join/start', {
        token: invitation.token,
        name: 'Ignored Name',
        password: TEST_PASSWORD,
      })
      expect(right.body).toEqual({ next: 'two_step' })
      const [kept] = await db.select({ name: users.name }).from(users).where(eq(users.email, email))
      expect(kept?.name).toBe('Kemi Ojo')
    } finally {
      await closeInvitation(invitation.id)
    }
  })

  // Risk §1b.20: Better Auth's own lockout must not stop a right code at set-up, and our sign-in
  // lock never counts set-up codes.
  it('lets a right code through after six wrong ones at set-up, without locking sign-in', async () => {
    const { app } = testApp()
    const email = uniqueEmail('lockout')
    const invitation = await createStaffInvitation(db, { email })
    const b = browser(app)
    await b.rpc('console/join/start', {
      token: invitation.token,
      name: 'Kemi Ojo',
      password: TEST_PASSWORD,
    })
    const enabled = await b.auth('/two-factor/enable', { password: TEST_PASSWORD })
    const uri = String(enabled.json.totpURI)
    for (let i = 0; i < 6; i++) {
      const res = await b.auth('/two-factor/verify-totp', { code: '000000' })
      expect(res.status).not.toBe(200)
    }
    const res = await b.auth('/two-factor/verify-totp', { code: totpFromUri(uri) })
    expect(res.status).toBe(200)
    expect(await db.select().from(signInLocks).where(eq(signInLocks.email, email))).toEqual([])
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, user?.id ?? ''))
    expect(admin).toBeDefined()
  })

  it('does nothing at the code when the invitation was withdrawn after the password', async () => {
    const { app } = testApp()
    const email = uniqueEmail('withdrawn')
    const invitation = await createStaffInvitation(db, { email })
    const b = browser(app)
    await b.rpc('console/join/start', {
      token: invitation.token,
      name: 'Kemi Ojo',
      password: TEST_PASSWORD,
    })
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const enabled = await b.auth('/two-factor/enable', { password: TEST_PASSWORD })
    await closeInvitation(invitation.id)
    // Another test's staff action may discard the account first: either way, no super-admin.
    await b.auth('/two-factor/verify-totp', { code: totpFromUri(String(enabled.json.totpURI)) })
    expect(
      await db
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, user?.id ?? '')),
    ).toEqual([])
    expect((await b.rpc('console/join/get', { token: invitation.token })).body).toMatchObject({
      status: 'withdrawn',
    })
  })
})

describe('signing in as an unfinished staff account', () => {
  it('is refused like a wrong password once the invitation expired, and the account goes', async () => {
    const { app } = testApp()
    const email = uniqueEmail('expired')
    const invitation = await createStaffInvitation(db, { email })
    await browser(app).rpc('console/join/start', {
      token: invitation.token,
      name: 'Kemi Ojo',
      password: TEST_PASSWORD,
    })
    await db
      .update(staffInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(staffInvitations.id, invitation.id))
    const res = await signIn(browser(app), email)
    expect(res.status).toBe(401)
    expect(res.json.code).toBe('INVALID_EMAIL_OR_PASSWORD')
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([])
  })

  it('gets no reset-password email', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail('noreset')
    const invitation = await createStaffInvitation(db, { email })
    try {
      await browser(app).rpc('console/join/start', {
        token: invitation.token,
        name: 'Kemi Ojo',
        password: TEST_PASSWORD,
      })
      await browser(app).auth('/request-password-reset', { email, redirectTo: '/reset-password' })
      expect(mailer.to(email).filter((m) => m.tag === 'reset_password')).toEqual([])
    } finally {
      await closeInvitation(invitation.id)
    }
  })
})

describe('a customer sign-up with a staff email', () => {
  it('answers normally and sends the staff note instead of an account', async () => {
    const { app, mailer } = testApp()
    const staff = await createSuperAdmin(db, { email: uniqueEmail('ada.staff') })
    const { signUp } = await import('@/test/flows')
    const res = await signUp(browser(app), staff.email)
    expect(res.status).toBe(200)
    const [note] = mailer.to(staff.email)
    expect(note?.subject).toBe(
      'Someone tried to create a Vento Real Estate customer account with your email',
    )
  })
})

describe('rate limits on the staff sign-up', () => {
  it('allow 20 link checks and 10 starts a minute per network', async () => {
    const app = createApp({
      db,
      mailer: createMemoryTransport(),
      auth: createAuth({ db, mailer: createMemoryTransport() }),
      rateLimiter: createRateLimiter(true),
    })
    const b = browser(app)
    const token = 'x'.repeat(43)
    for (let i = 0; i < 20; i++)
      expect((await b.rpc('console/join/get', { token })).status).toBe(200)
    expect((await b.rpc('console/join/get', { token })).status).toBe(429)
    for (let i = 0; i < 10; i++) {
      expect((await b.rpc('console/join/start', { token, password: 'x' })).status).toBe(409)
    }
    expect((await b.rpc('console/join/start', { token, password: 'x' })).status).toBe(429)
  })
})
