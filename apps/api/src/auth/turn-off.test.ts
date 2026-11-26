import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { auditEvents, members, organizations, sessions, users } from '@/db/schema'
import { browser, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { createMember, createOrganization, type TestUser } from '@/test/factories'
import { setUpTwoStep, signIn, signUpVerified } from '@/test/flows'

// Committed data (Better Auth runs on the pool): every test makes its own people.

async function salesPersonWithTwoStep() {
  const { app, mailer } = testApp()
  const email = uniqueEmail('grace')
  const b = browser(app)
  await signUpVerified(b, mailer, email)
  const twoStep = await setUpTwoStep(b)
  const [user] = await db.select().from(users).where(eq(users.email, email))
  if (!user) throw new Error('no user')
  // Unique names: these commit, and the flags and plans command tests find organizations by name.
  const vento = await createOrganization(db, {
    name: `Turn Off Homes ${uniqueEmail('o')}`.slice(0, 60),
  })
  await createMember(db, vento, { role: 'sales', user: user as TestUser })
  return { app, mailer, email, b, user, vento, ...twoStep }
}

const turnOff = (b: ReturnType<typeof browser>, body: Record<string, unknown>) =>
  b.auth('/two-factor/disable', { password: 'Parkview-gate-2026', ...body })

async function failures(userId: string) {
  return db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, userId), eq(auditEvents.action, 'auth.two_step_failed')))
}

describe('turning two-step off', () => {
  it('needs a code as well as the password', async () => {
    const { b } = await salesPersonWithTwoStep()
    const res = await turnOff(b, {})
    expect(res.status).toBe(400)
    expect(res.json.code).toBe('CODE_REQUIRED')
  })

  it('turns off with the password and a current code, and emails', async () => {
    const { b, mailer, email, user, totpURI } = await salesPersonWithTwoStep()
    const res = await turnOff(b, { code: totpFromUri(totpURI) })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.id, user.id))
    expect(row?.twoFactorEnabled).toBe(false)
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento: two-step sign-in was turned off')
  })

  it('accepts a backup code instead of the app', async () => {
    const { b, backupCodes } = await salesPersonWithTwoStep()
    expect((await turnOff(b, { backupCode: backupCodes[0] })).status).toBe(200)
  })

  it('checks the password before the code, so a wrong one never spends a backup code', async () => {
    const { b, backupCodes } = await salesPersonWithTwoStep()
    const wrong = await turnOff(b, { password: 'Not-my-password-1', backupCode: backupCodes[0] })
    expect(wrong.json.code).toBe('INVALID_PASSWORD')
    expect((await turnOff(b, { backupCode: backupCodes[0] })).status).toBe(200)
  })

  it('refuses a wrong code and audits it', async () => {
    const { b, user } = await salesPersonWithTwoStep()
    const res = await turnOff(b, { code: '000000' })
    expect(res.status).toBe(400)
    expect(res.json.code).toBe('INVALID_CODE')
    expect(await failures(user.id)).toHaveLength(1)
  })

  it('locks sign-in, signs out everywhere and emails after 5 wrong codes', async () => {
    const { app, b, mailer, email, user } = await salesPersonWithTwoStep()
    await signIn(browser(app), email) // another device
    const results = []
    for (let i = 0; i < 5; i++) results.push(await turnOff(b, { code: '000000' }))
    expect(results.at(-1)?.status).toBe(429)
    expect(results.at(-1)?.json.code).toBe('ACCOUNT_LOCKED')
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([])
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento: sign-in locked for 15 minutes')
  })

  it('is refused while the role requires it, naming the role and organization', async () => {
    const { b, user, vento } = await salesPersonWithTwoStep()
    await db
      .update(members)
      .set({ roleId: vento.roleIds.get('finance') ?? '' })
      .where(eq(members.userId, user.id))
    const res = await turnOff(b, { code: '000000' })
    expect(res.status).toBe(403)
    expect(res.json.code).toBe('TWO_STEP_REQUIRED_BY_ROLE')
    expect(res.json.message).toBe(
      `Two-step is required for your role (Finance) in ${vento.name}, so it can't be turned off.`,
    )
  })

  it('is refused while another organization requires it for everyone', async () => {
    const { b, user } = await salesPersonWithTwoStep()
    const lekki = await createOrganization(db, {
      name: `Turn Off Partners ${uniqueEmail('o')}`.slice(0, 60),
    })
    await db
      .update(organizations)
      .set({ twoStepRequiredForEveryone: true, twoStepRequiredChangedAt: new Date() })
      .where(eq(organizations.id, lekki.id))
    const { member } = await createMember(db, lekki, { role: 'sales', user: user as TestUser })
    const refused = await turnOff(b, { code: '000000' })
    expect(refused.json.code).toBe('TWO_STEP_REQUIRED_BY_ORGANIZATION')
    expect(refused.json.message).toBe(
      `${lekki.name} requires two-step for everyone, so it can't be turned off.`,
    )
    // Removed from the only organization that required it: allowed again.
    await db
      .update(members)
      .set({ status: 'removed', removedAt: new Date() })
      .where(eq(members.id, member.id))
    expect((await turnOff(b, { code: '000000' })).json.code).toBe('INVALID_CODE')
  })
})

describe('wrong passwords while signed in', () => {
  it('count towards the lock on change password, and this session carries on', async () => {
    const { b, email } = await salesPersonWithTwoStep()
    const res = await b.auth('/change-password', {
      currentPassword: 'Not-my-password-1',
      newPassword: 'Another-gate-2027',
    })
    expect(res.json.code).toBe('INVALID_PASSWORD')
    const [row] = await db.select().from(users).where(eq(users.email, email))
    const signedFailures = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.targetId, row?.id ?? ''), eq(auditEvents.action, 'auth.sign_in_failed')),
      )
    expect(signedFailures).toHaveLength(1)
    expect((await b.rpc('account/me')).status).toBe(200)
  })
})

describe('new sign-in alerts', () => {
  it('sends none for the first sign-in, none for a known browser, one for a new one', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail('kunle')
    const laptop = browser(app)
    await signUpVerified(laptop, mailer, email)
    const [user] = await db.select().from(users).where(eq(users.email, email))
    const org = await createOrganization(db, {
      name: `Alert Homes ${uniqueEmail('o')}`.slice(0, 60),
    })
    await createMember(db, org, { role: 'sales', user: user as TestUser })
    const alerts = () => mailer.to(email).filter((m) => m.subject.startsWith('Vento: new sign-in'))
    expect(alerts()).toHaveLength(0)
    await signIn(laptop, email)
    expect(alerts()).toHaveLength(0)
    await signIn(browser(app, 'Mozilla/5.0 (iPhone) Safari/604.1'), email)
    expect(alerts().map((m) => m.subject)).toEqual(['Vento: new sign-in on Safari on iPhone'])
  })
})

describe('checking codes while signed in', () => {
  it('refuses the verify endpoints once two-step is on, right code or wrong, so they check nothing', async () => {
    const { b, totpURI, backupCodes } = await salesPersonWithTwoStep()
    const answers = []
    for (let i = 0; i < 10; i++)
      answers.push(await b.auth('/two-factor/verify-totp', { code: '000000' }))
    answers.push(await b.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI) }))
    answers.push(await b.auth('/two-factor/verify-backup-code', { code: backupCodes[0] }))
    expect(new Set(answers.map((a) => a.json.code))).toEqual(new Set(['TWO_STEP_ALREADY_ON']))
    // The backup code wasn't spent.
    expect((await turnOff(b, { backupCode: backupCodes[0] })).status).toBe(200)
  })
})
