import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { addAttempt } from '@/auth/security-store'
import { db } from '@/db/client'
import { platformAdmins, platformAuditEvents, staffInvitations, users } from '@/db/schema'
import { runWithRequestScope } from '@/lib/request-scope'
import { browser, linkFromEmail, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { createStaffInvitation, createSuperAdmin, TEST_PASSWORD } from '@/test/factories'
import { joinAsStaff, setUpTwoStep, signIn } from '@/test/flows'
import { resetSuperAdminTwoStep, revokeSuperAdmin } from '../operations/super-admin'

// Resetting and re-joining staff accounts over HTTP, through Better Auth (1b security review).
// These commit, so each makes its own people.

const NEW_PASSWORD = 'Lekki-harbour-2027'

type App = ReturnType<typeof testApp>['app']

async function tokenFromLink(app: App, link: string): Promise<string> {
  const url = new URL(link)
  const res = await app.request(`${url.pathname}${url.search}`)
  return new URL(res.headers.get('location') ?? '', 'http://x').searchParams.get('token') ?? ''
}

const actorFor = (admin: { id: string; name: string }, channel: 'console' | 'command') => ({
  userId: admin.id,
  name: admin.name,
  channel,
  operator: 'test',
})

describe('after a super-admin two-step reset (audit M1)', () => {
  it('a password alone neither signs in nor opens the console; the inbox link and a new code do, with a fresh check', async () => {
    const { app, mailer, auth } = testApp()
    const tunde = browser(app)
    const { email, userId } = await joinAsStaff(tunde, 'Tunde Bello')
    const ada = await createSuperAdmin(db, { email: uniqueEmail('ada.m1') })
    await resetSuperAdminTwoStep(db, actorFor(ada, 'command'), {
      userId,
      reason: 'Lost phone',
      allowSelf: true,
    })
    // The password someone may hold is no longer enough.
    const blocked = await signIn(browser(app), email)
    expect(blocked.status).toBe(403)
    expect(blocked.json.code).toBe('PASSWORD_RESET_REQUIRED')
    // The inbox is the proof: the reset's own link sets a new password.
    await runWithRequestScope(
      {
        requestId: 't',
        ip: null,
        ipMasked: null,
        userAgent: null,
        userAgentSummary: null,
        auth: { adminResetLink: true },
      },
      () => auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } }),
    )
    const token = await tokenFromLink(app, linkFromEmail(mailer, email, 'reset_password'))
    expect(
      (await browser(app).auth('/reset-password', { token, newPassword: NEW_PASSWORD })).status,
    ).toBe(200)
    // New password, new authenticator: still not fresh proof for the console.
    const b = browser(app)
    expect((await signIn(b, email, NEW_PASSWORD)).status).toBe(200)
    await setUpTwoStep(b, NEW_PASSWORD)
    const opened = await b.rpc('console/access/open')
    expect(opened.body).toMatchObject({ freshProof: false })
    expect(opened.body.window).not.toBe('open')
  })

  it('a staff sign-up’s first set-up still opens the console without asking again', async () => {
    const { app } = testApp()
    const b = browser(app)
    await joinAsStaff(b)
    expect((await b.rpc('console/access/open')).body).toMatchObject({
      window: 'open',
      freshProof: true,
    })
  })

  it('sends the reset link even when the inbox reached its hourly cap (audit L7)', async () => {
    const { mailer, auth } = testApp()
    const ada = await createSuperAdmin(db, {
      email: uniqueEmail('ada.l7'),
      password: TEST_PASSWORD,
    })
    for (let i = 0; i < 5; i++) await addAttempt(db, 'password_reset_email', ada.email)
    await auth.api.requestPasswordReset({
      body: { email: ada.email, redirectTo: '/reset-password' },
    })
    expect(mailer.to(ada.email).filter((m) => m.tag === 'reset_password')).toHaveLength(0)
    await runWithRequestScope(
      {
        requestId: 't',
        ip: null,
        ipMasked: null,
        userAgent: null,
        userAgentSummary: null,
        auth: { adminResetLink: true },
      },
      () =>
        auth.api.requestPasswordReset({
          body: { email: ada.email, redirectTo: '/reset-password' },
        }),
    )
    expect(mailer.to(ada.email).filter((m) => m.tag === 'reset_password')).toHaveLength(1)
  })
})

describe('a removed super-admin re-invited (review 3, audit L1)', () => {
  it('joins again on the same account, with a new password that is not an old one', async () => {
    const { app } = testApp()
    const first = browser(app)
    const { email, userId } = await joinAsStaff(first, 'Kemi Ojo')
    const ada = await createSuperAdmin(db, { email: uniqueEmail('ada.rejoin') })
    await revokeSuperAdmin(db, actorFor(ada, 'console'), { userId, reason: 'Left the team' })
    const invitation = await createStaffInvitation(db, { email, name: 'Kemi Ojo', invitedBy: ada })
    const b = browser(app)
    const reused = await b.rpc('console/join/start', {
      token: invitation.token,
      password: TEST_PASSWORD,
    })
    expect(reused.status).toBe(400)
    expect(reused.body).toMatchObject({ data: { reason: 'PASSWORD_REUSED' } })
    const started = await b.rpc('console/join/start', {
      token: invitation.token,
      password: NEW_PASSWORD,
    })
    expect(started.body).toEqual({ next: 'two_step' })
    await setUpTwoStep(b, NEW_PASSWORD)
    const [again] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(again?.id).toBe(userId)
    const [active] = await db
      .select()
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, userId), sql`${platformAdmins.revokedAt} is null`))
    expect(active).toBeDefined()
    const [joined] = await db
      .select({ action: platformAuditEvents.action })
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetKey, invitation.id))
    expect(joined?.action).toBe('superadmin.joined')
  })
})

describe('a join that did not land at set-up (review minor)', () => {
  it('completes when the joining account passes two-step at sign-in', async () => {
    const { app } = testApp()
    const ada = await createSuperAdmin(db, { email: uniqueEmail('ada.retry') })
    const email = uniqueEmail('retry')
    const invitation = await createStaffInvitation(db, { email, invitedBy: ada })
    const b = browser(app)
    await b.rpc('console/join/start', {
      token: invitation.token,
      name: 'Kemi Ojo',
      password: TEST_PASSWORD,
    })
    // The inviter is removed for a moment, so the join refuses at set-up (review 2)…
    await db
      .update(platformAdmins)
      .set({ revokedAt: new Date() })
      .where(eq(platformAdmins.userId, ada.id))
    const { totpURI } = await setUpTwoStep(b)
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const noneYet = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, user?.id ?? ''))
    expect(noneYet).toEqual([])
    // …and is back by the next sign-in, which finishes it.
    await db
      .update(platformAdmins)
      .set({ revokedAt: null })
      .where(eq(platformAdmins.userId, ada.id))
    const next = browser(app)
    await signIn(next, email)
    const res = await next.auth('/two-factor/verify-totp', {
      code: totpFromUri(totpURI, Date.now() + 30_000),
    })
    expect(res.status).toBe(200)
    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, user?.id ?? ''))
    expect(admin?.revokedAt).toBeNull()
    const [row] = await db
      .select()
      .from(staffInvitations)
      .where(eq(staffInvitations.id, invitation.id))
    expect(row?.status).toBe('accepted')
  })
})
