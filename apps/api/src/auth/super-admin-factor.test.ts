import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { members, organizationPlans, sessions, twoFactors, users } from '@/db/schema'
import { browser, testApp } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { TEST_PASSWORD } from '@/test/factories'
import { joinAsStaff, onboard, setUpTwoStep, signUpVerified } from '@/test/flows'

// Audit H1: a password and a live session must not make a new second factor that opens the
// Vento console. These commit (Better Auth runs on the pool), so each makes its own person.

async function person(superAdmin: boolean) {
  const { app, mailer } = testApp()
  const b = browser(app)
  if (superAdmin) {
    // A staff account through the real staff sign-up (decision 0023).
    const { email, userId } = await joinAsStaff(b)
    return { b, email, userId, mailer }
  }
  const email = uniqueEmail('factor')
  await signUpVerified(b, mailer, email)
  await onboard(b, `Factor Homes ${uniqueEmail('o')}`.slice(0, 60))
  await setUpTwoStep(b)
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const userId = user?.id ?? ''
  const [membership] = await db.select().from(members).where(eq(members.userId, userId))
  // Passkeys available to this organization only (never a global stage).
  await db
    .update(organizationPlans)
    .set({ releaseGroup: 'internal' })
    .where(eq(organizationPlans.organizationId, membership?.organizationId ?? ''))
  return { b, email, userId, mailer }
}

/** The code proven at set-up was 10 minutes ago: only the password is fresh now. */
async function ageFactor(userId: string) {
  await db
    .update(sessions)
    .set({ secondFactorAt: new Date(Date.now() - 10 * 60_000) })
    .where(eq(sessions.userId, userId))
}

describe('a super-admin with only a password', () => {
  it('cannot make new backup codes', async () => {
    const { b, userId } = await person(true)
    await ageFactor(userId)
    const res = await b.auth('/two-factor/generate-backup-codes', { password: TEST_PASSWORD })
    expect(res.status).toBe(403)
    expect(res.json.code).toBe('SECOND_FACTOR_REQUIRED')
  })

  it('cannot add a passkey after confirming the password', async () => {
    const { b, userId } = await person(true)
    await ageFactor(userId)
    await b.rpc('account/confirmPassword', { password: TEST_PASSWORD })
    const options = await b.authGet('/passkey/generate-register-options')
    expect(options.status).toBe(403)
    expect(options.json.code).toBe('SECOND_FACTOR_REQUIRED')
  })
})

describe('new backup codes', () => {
  it('are allowed for a super-admin with a fresh code, marked proven, and emailed', async () => {
    const { b, email, userId, mailer } = await person(true)
    const res = await b.auth('/two-factor/generate-backup-codes', { password: TEST_PASSWORD })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(twoFactors).where(eq(twoFactors.userId, userId))
    expect(row?.backupCodesUnprovenAt).toBeNull()
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento: new backup codes were made')
  })

  it('made with only a password by anyone else are marked, so they never open the console', async () => {
    const { b, userId } = await person(false)
    await ageFactor(userId)
    const res = await b.auth('/two-factor/generate-backup-codes', { password: TEST_PASSWORD })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(twoFactors).where(eq(twoFactors.userId, userId))
    expect(row?.backupCodesUnprovenAt).toBeInstanceOf(Date)
  })
})
