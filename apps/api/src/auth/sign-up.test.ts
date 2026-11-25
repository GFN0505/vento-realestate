import { CURRENT_TERMS_VERSION } from '@vento/shared'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { authAttempts, users } from '@/db/schema'
import { browser, codeFromEmail, testApp } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { signUp } from '@/test/flows'

describe('sign up', () => {
  it.each([
    ['short1', 'PASSWORD_TOO_SHORT'],
    ['no-number-in-here', 'PASSWORD_NEEDS_NUMBER'],
    ['Sunshine12345', 'PASSWORD_TOO_COMMON'],
  ])('refuses %s with %s', async (password, code) => {
    const { app } = testApp()
    const res = await signUp(browser(app), uniqueEmail(), { password })
    expect(res.status).toBe(400)
    expect(res.json.code).toBe(code)
  })

  it('refuses a password the breach check reports as leaked', async () => {
    const { app } = testApp({ breachCheck: async () => true })
    const res = await signUp(browser(app), uniqueEmail())
    expect(res.json.code).toBe('PASSWORD_BREACHED')
  })

  it('accepts when the breach check is down (fails open)', async () => {
    const { app } = testApp({ breachCheck: async () => 'unknown' })
    expect((await signUp(browser(app), uniqueEmail())).status).toBe(200)
  })

  it('requires the current terms version and records when it was accepted', async () => {
    const { app } = testApp()
    const email = uniqueEmail()
    expect((await signUp(browser(app), email, { termsVersion: 'old' })).json.code).toBe(
      'TERMS_NOT_ACCEPTED',
    )
    await signUp(browser(app), email)
    const [user] = await db.select().from(users).where(eq(users.email, email))
    expect(user?.termsVersion).toBe(CURRENT_TERMS_VERSION)
    expect(user?.termsAcceptedAt).toBeInstanceOf(Date)
  })

  it('sends one email with both a link and a 6-digit code', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUp(browser(app), email)
    const sent = mailer.to(email)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toMatch(/\/api\/auth\/verify-email\?token=/)
    expect(codeFromEmail(mailer, email)).toMatch(/^\d{6}$/)
  })

  it('answers a duplicate email like a new one and emails the existing account instead', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUp(browser(app), email)
    const second = await signUp(browser(app), email, { name: 'Someone Else' })
    expect(second.status).toBe(200)
    expect(mailer.to(email).map((m) => m.tag)).toEqual(['verify_email', 'existing_account'])
    expect(mailer.to(email)[1]?.text).toContain(
      'Someone tried to create a Vento account with your email. Sign in or reset your password.',
    )
  })

  it('signs in after verifying with the code, with nothing open before that', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    const b = browser(app)
    await signUp(b, email)
    expect(
      (await b.auth('/sign-in/email', { email, password: 'Parkview-gate-2026' })).json.code,
    ).toBe('EMAIL_NOT_VERIFIED')
    expect((await b.rpc('account/me')).status).toBe(401)
    await b.auth('/email-otp/verify-email', { email, otp: codeFromEmail(mailer, email) })
    const me = await b.rpc('account/me')
    expect(me.body).toMatchObject({ nextStep: 'onboarding_organization', organization: null })
  })

  it('redirects an invalid verification link with an error', async () => {
    const { app } = testApp()
    const res = await app.request('/api/auth/verify-email?token=nonsense&callbackURL=/verify-email')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=')
  })

  it('limits resending to once a minute', async () => {
    const { app } = testApp()
    const email = uniqueEmail()
    const b = browser(app)
    await signUp(b, email)
    const res = await b.auth('/send-verification-email', { email })
    expect(res.status).toBe(429)
    expect(res.json).toMatchObject({ code: 'VERIFICATION_RESEND_LIMITED' })
    expect(res.json.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('stops after 5 verification emails in an hour', async () => {
    const { app } = testApp()
    const email = uniqueEmail()
    const tenMinutesAgo = sql`now() - interval '10 minutes'`
    await db.insert(authAttempts).values(
      Array.from({ length: 5 }, () => ({
        kind: 'verification_email' as const,
        subject: email,
        createdAt: tenMinutesAgo,
      })),
    )
    const res = await browser(app).auth('/send-verification-email', { email })
    expect(res.status).toBe(429)
    // Not the one-minute wait: the hourly window, about 50 minutes away.
    expect(res.json.retryAfterSeconds).toBeGreaterThan(40 * 60)
  })
})
