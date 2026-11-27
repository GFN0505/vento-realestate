import { eq, like } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { sessions, users, verifications } from '@/db/schema'
import { browser, linkFromEmail, testApp } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { TEST_PASSWORD } from '@/test/factories'
import { onboard, setUpTwoStep, signIn, signUpVerified } from '@/test/flows'

const NEW_PASSWORD = 'Lekki-pearl-gardens-4'

async function requestReset(app: ReturnType<typeof testApp>['app'], email: string) {
  return browser(app).auth('/request-password-reset', { email, redirectTo: '/reset-password' })
}

/** Follows the emailed link the way a browser would and returns the token it lands with. */
async function tokenFromLink(app: ReturnType<typeof testApp>['app'], link: string) {
  const url = new URL(link)
  const res = await app.request(`${url.pathname}${url.search}`)
  const location = new URL(res.headers.get('location') ?? '', 'http://x')
  return {
    status: res.status,
    path: location.pathname,
    token: location.searchParams.get('token') ?? '',
  }
}

describe('reset password', () => {
  it('replies the same whether or not the account exists', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    const known = await requestReset(app, email)
    const unknown = await requestReset(app, uniqueEmail('nobody'))
    expect(known.status).toBe(unknown.status)
    expect(known.json).toEqual(unknown.json)
  })

  it('emails a link that lands on /reset-password with a token valid for 30 minutes', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    await requestReset(app, email)
    const landed = await tokenFromLink(app, linkFromEmail(mailer, email, 'reset_password'))
    expect(landed).toMatchObject({ status: 302, path: '/reset-password' })
    const [row] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `reset-password:${landed.token}`))
    const minutes = ((row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0)) / 60_000
    expect(Math.round(minutes)).toBe(30)
    const info = await browser(app).rpc('account/passwordResetInfo', { token: landed.token })
    expect(info.body).toEqual({ email })
  })

  it('refuses one of the last 5 passwords', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    await requestReset(app, email)
    const { token } = await tokenFromLink(app, linkFromEmail(mailer, email, 'reset_password'))
    const res = await browser(app).auth('/reset-password', { token, newPassword: TEST_PASSWORD })
    expect(res.json.code).toBe('PASSWORD_REUSED')
  })

  it('ends other sessions, alerts, works once, and still asks for two-step next time', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail('owner')
    const b = browser(app)
    await signUpVerified(b, mailer, email)
    await onboard(b)
    await setUpTwoStep(b)
    await requestReset(app, email)
    const { token } = await tokenFromLink(app, linkFromEmail(mailer, email, 'reset_password'))
    expect(
      (await browser(app).auth('/reset-password', { token, newPassword: NEW_PASSWORD })).status,
    ).toBe(200)

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user?.id ?? '')),
    ).toHaveLength(0)
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento Real Estate: your password was changed')
    expect(
      (await browser(app).auth('/reset-password', { token, newPassword: 'Another-new-pass-5' }))
        .json.code,
    ).toBe('INVALID_TOKEN')
    expect((await signIn(browser(app), email, NEW_PASSWORD)).json).toMatchObject({
      twoFactorRedirect: true,
    })
  })

  it('rejects an expired token', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    await requestReset(app, email)
    const { token } = await tokenFromLink(app, linkFromEmail(mailer, email, 'reset_password'))
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(like(verifications.identifier, `reset-password:${token}`))
    expect(
      (await browser(app).auth('/reset-password', { token, newPassword: NEW_PASSWORD })).json.code,
    ).toBe('INVALID_TOKEN')
  })
})
