import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { auditEvents, sessions, signInLocks, users } from '@/db/schema'
import { browser, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { onboard, setUpTwoStep, signIn, signUpVerified } from '@/test/flows'

async function ownerWithTwoStep() {
  const { app, mailer } = testApp()
  const email = uniqueEmail('owner')
  const b = browser(app)
  await signUpVerified(b, mailer, email)
  await onboard(b)
  const twoStep = await setUpTwoStep(b)
  return { app, mailer, email, ...twoStep }
}

async function auditActions(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const rows = await db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.targetId, user?.id ?? ''))
  return rows.map((r) => r.action)
}

describe('sign in', () => {
  it('gives the same answer for a wrong email and a wrong password', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    const wrongPassword = await signIn(browser(app), email, 'Wrong-password-99')
    const wrongEmail = await signIn(browser(app), uniqueEmail('nobody'), 'Wrong-password-99')
    expect(wrongPassword.json).toEqual(wrongEmail.json)
    expect(wrongPassword.json.code).toBe('INVALID_EMAIL_OR_PASSWORD')
  })

  it('makes an owner set up two-step before anything else', async () => {
    const { app, mailer } = testApp()
    const b = browser(app)
    await signUpVerified(b, mailer, uniqueEmail())
    await onboard(b)
    expect((await b.rpc('account/me')).body.nextStep).toBe('two_step_setup')
    const res = await b.rpc('organization/get')
    expect(res.status).toBe(403)
    expect(res.body.data).toEqual({ reason: 'two_step_setup_required' })
    await setUpTwoStep(b)
    expect((await b.rpc('account/me')).body.nextStep).toBe('ready')
    expect((await b.rpc('organization/get')).status).toBe(200)
  })

  it('always asks for the code after the password once two-step is on', async () => {
    const { app, email, totpURI } = await ownerWithTwoStep()
    const b = browser(app)
    const first = await signIn(b, email)
    expect(first.json).toMatchObject({ twoFactorRedirect: true })
    expect((await b.rpc('account/me')).status).toBe(401)
    const verified = await b.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI) })
    expect(verified.status).toBe(200)
    expect((await b.rpc('account/me')).body.nextStep).toBe('ready')
    expect(await auditActions(email)).toContain('auth.signed_in')
  })

  it('accepts a backup code once and emails how many are left', async () => {
    const { app, mailer, email, backupCodes } = await ownerWithTwoStep()
    const code = backupCodes[0] ?? ''
    const b = browser(app)
    await signIn(b, email)
    expect((await b.auth('/two-factor/verify-backup-code', { code })).status).toBe(200)
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento: a backup code was used (9 left)')
    const again = browser(app)
    await signIn(again, email)
    expect((await again.auth('/two-factor/verify-backup-code', { code })).json.code).toBe(
      'INVALID_BACKUP_CODE',
    )
  })

  it('never trusts the device, whatever the client asks', async () => {
    const { app, email, totpURI } = await ownerWithTwoStep()
    const b = browser(app)
    await signIn(b, email)
    await b.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI), trustDevice: true })
    expect([...b.jar.keys()].some((k) => k.includes('trust_device'))).toBe(false)
  })

  it("won't let a role that requires two-step turn it off", async () => {
    const { app, email, totpURI } = await ownerWithTwoStep()
    const b = browser(app)
    await signIn(b, email)
    await b.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI) })
    const res = await b.auth('/two-factor/disable', { password: 'Parkview-gate-2026' })
    expect(res.status).toBe(403)
    expect(res.json.code).toBe('TWO_STEP_REQUIRED_BY_ROLE')
  })

  it('keeps a "keep me signed in" session for 30 days and others for 12 hours', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    await signIn(browser(app), email, undefined, true)
    await signIn(browser(app), email, undefined, false)
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    const rows = await db
      .select({
        persistent: sessions.persistent,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, user?.id ?? ''))
    const hours = (r: (typeof rows)[number]) =>
      (r.expiresAt.getTime() - r.createdAt.getTime()) / 3_600_000
    const persistent = rows.find((r) => r.persistent)
    const regular = rows.filter((r) => !r.persistent)
    expect(persistent && Math.round(hours(persistent))).toBe(30 * 24)
    expect(regular.length).toBeGreaterThan(0)
    expect(regular.every((r) => Math.round(hours(r)) === 12)).toBe(true)
  })
})

describe('lockout', () => {
  it('locks after 5 wrong codes, even for the right password and code, and emails once', async () => {
    const { app, mailer, email, totpURI } = await ownerWithTwoStep()
    const b = browser(app)
    await signIn(b, email)
    const results = []
    for (let i = 0; i < 5; i++)
      results.push(await b.auth('/two-factor/verify-totp', { code: '000000' }))
    expect(results.slice(0, 4).map((r) => r.json.code)).toEqual(Array(4).fill('INVALID_CODE'))
    expect(results[4]?.status).toBe(429)
    expect(results[4]?.json.code).toBe('ACCOUNT_LOCKED')
    expect(Date.parse(String(results[4]?.json.lockedUntil))).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    )
    expect(
      mailer.to(email).filter((m) => m.subject === 'Vento: sign-in locked for 15 minutes'),
    ).toHaveLength(1)

    const later = await signIn(browser(app), email)
    expect(later.json.code).toBe('ACCOUNT_LOCKED')
    const c = browser(app)
    expect(
      (await c.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI) })).status,
    ).not.toBe(200)
    expect(await auditActions(email)).toContain('auth.locked_out')
  })

  it('locks after 10 wrong passwords in 15 minutes', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    const codes = []
    for (let i = 0; i < 10; i++)
      codes.push((await signIn(browser(app), email, 'Wrong-password-99')).json.code)
    expect(codes.slice(0, 9).every((c) => c === 'INVALID_EMAIL_OR_PASSWORD')).toBe(true)
    expect(codes[9]).toBe('ACCOUNT_LOCKED')
    expect((await signIn(browser(app), email)).status).toBe(429)
    expect((await signIn(browser(app), email)).json.code).toBe('ACCOUNT_LOCKED')
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento: sign-in locked for 15 minutes')
  })

  it('locks unknown emails the same way, so a lock reveals nothing', async () => {
    const { app } = testApp()
    const email = uniqueEmail('ghost')
    for (let i = 0; i < 10; i++) await signIn(browser(app), email, 'Wrong-password-99')
    expect((await signIn(browser(app), email)).json.code).toBe('ACCOUNT_LOCKED')
    const [lock] = await db
      .select()
      .from(signInLocks)
      .where(and(eq(signInLocks.email, email)))
    expect(lock?.userId).toBeNull()
  })

  it('resets the count after a successful sign-in', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    for (let i = 0; i < 9; i++) await signIn(browser(app), email, 'Wrong-password-99')
    expect((await signIn(browser(app), email)).status).toBe(200)
    expect((await signIn(browser(app), email, 'Wrong-password-99')).json.code).toBe(
      'INVALID_EMAIL_OR_PASSWORD',
    )
  })
})
