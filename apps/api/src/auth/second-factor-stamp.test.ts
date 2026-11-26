import { desc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { sessions, users } from '@/db/schema'
import { browser, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { TEST_PASSWORD } from '@/test/factories'
import { onboard, setUpTwoStep, signIn, signUpVerified } from '@/test/flows'

// `sessions.second_factor_at` (admin-console plan §4.1): set by a code, backup code or passkey,
// never by a password; the console window never survives a rotated session.

async function latestSession(email: string) {
  const [row] = await db
    .select({
      id: sessions.id,
      secondFactorAt: sessions.secondFactorAt,
      consoleOpenedAt: sessions.consoleOpenedAt,
      consoleActiveAt: sessions.consoleActiveAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(users.email, email))
    .orderBy(desc(sessions.createdAt))
    .limit(1)
  if (!row) throw new Error(`no session for ${email}`)
  return row
}

async function ownerWithTwoStep() {
  const { app, mailer } = testApp()
  const email = uniqueEmail('owner')
  const b = browser(app)
  await signUpVerified(b, mailer, email)
  await onboard(b, `Stamp Homes ${uniqueEmail('o')}`.slice(0, 60))
  const twoStep = await setUpTwoStep(b)
  return { app, email, b, ...twoStep }
}

describe('the second-factor stamp', () => {
  it('stays empty after a password-only sign-in and after confirming the password', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail()
    await signUpVerified(browser(app), mailer, email)
    const b = browser(app)
    expect((await signIn(b, email)).status).toBe(200)
    expect((await latestSession(email)).secondFactorAt).toBeNull()
    expect((await b.rpc('account/confirmPassword', { password: TEST_PASSWORD })).status).toBe(200)
    expect((await latestSession(email)).secondFactorAt).toBeNull()
  })

  it('is set when two-step is set up, on the rotated session', async () => {
    const { email } = await ownerWithTwoStep()
    expect((await latestSession(email)).secondFactorAt).toBeInstanceOf(Date)
  })

  it('is set by a code at sign-in', async () => {
    const { app, email, totpURI } = await ownerWithTwoStep()
    const b = browser(app)
    await signIn(b, email)
    expect((await b.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI) })).status).toBe(
      200,
    )
    const session = await latestSession(email)
    expect(session.secondFactorAt).toBeInstanceOf(Date)
    expect(session.consoleOpenedAt).toBeNull()
  })

  it('is set by a backup code at sign-in', async () => {
    const { app, email, backupCodes } = await ownerWithTwoStep()
    const b = browser(app)
    await signIn(b, email)
    const res = await b.auth('/two-factor/verify-backup-code', { code: backupCodes[0] })
    expect(res.status).toBe(200)
    expect((await latestSession(email)).secondFactorAt).toBeInstanceOf(Date)
  })

  it('carries over a password change, but the console window closes', async () => {
    const { b, email } = await ownerWithTwoStep()
    const before = await latestSession(email)
    const opened = new Date()
    await db
      .update(sessions)
      .set({ consoleOpenedAt: opened, consoleActiveAt: opened })
      .where(eq(sessions.id, before.id))
    const res = await b.auth('/change-password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'Lekki-pearl-gardens-4',
    })
    expect(res.status).toBe(200)
    const after = await latestSession(email)
    expect(after.id).not.toBe(before.id)
    expect(after.secondFactorAt?.getTime()).toBe(before.secondFactorAt?.getTime())
    expect(after.consoleOpenedAt).toBeNull()
    expect(after.consoleActiveAt).toBeNull()
  })
})
