import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/client'
import { twoFactors, users } from '@/db/schema'
import { browser, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { setUpTwoStep, signUpVerified } from '@/test/flows'

// Our before-hooks look the session up themselves; Better Auth swallows any error in that lookup
// and answers null. The plugin's endpoint then looks it up again on its own. If ours is the one
// that fails (a dropped connection, a timeout) the guard must refuse, not step aside: otherwise
// the plugin acts on the password alone. Only our hooks import `better-auth/api`, so failing it
// here leaves the plugin's own lookup working, which is exactly the dangerous case.
const lookup = vi.hoisted(() => ({ fail: false }))

vi.mock('better-auth/api', async (original) => {
  const actual = await original<typeof import('better-auth/api')>()
  return {
    ...actual,
    getSessionFromCtx: ((...args: Parameters<typeof actual.getSessionFromCtx>) =>
      lookup.fail ? Promise.resolve(null) : actual.getSessionFromCtx(...args)) as never,
  }
})

afterEach(() => {
  lookup.fail = false
})

async function personWithTwoStep() {
  const { app, mailer } = testApp()
  const email = uniqueEmail('ngozi')
  const b = browser(app)
  await signUpVerified(b, mailer, email)
  const twoStep = await setUpTwoStep(b)
  const [user] = await db.select().from(users).where(eq(users.email, email))
  if (!user) throw new Error('no user')
  return { b, user, ...twoStep }
}

describe('when our own session lookup fails', () => {
  it('refuses to turn two-step off, even with the right password and no code', async () => {
    const { b, user } = await personWithTwoStep()
    lookup.fail = true
    const res = await b.auth('/two-factor/disable', { password: 'Parkview-gate-2026' })
    lookup.fail = false
    expect(res.status).toBe(401)
    const [row] = await db.select().from(users).where(eq(users.id, user.id))
    expect(row?.twoFactorEnabled).toBe(true)
    expect(await db.select().from(twoFactors).where(eq(twoFactors.userId, user.id))).toHaveLength(1)
  })

  it.each([
    ['/two-factor/generate-backup-codes', { password: 'Parkview-gate-2026' }],
    ['/two-factor/enable', { password: 'Parkview-gate-2026' }],
    [
      '/change-password',
      { currentPassword: 'Parkview-gate-2026', newPassword: 'Ikoyi-bridge-2027' },
    ],
  ])('refuses %s rather than skipping its checks', async (path, body) => {
    const { b } = await personWithTwoStep()
    lookup.fail = true
    const res = await b.auth(path, body)
    lookup.fail = false
    expect(res.status).toBe(401)
  })
})

describe('turning two-step off with a wrong code', () => {
  it('never turns it off, whatever the wrong code', async () => {
    const { b, user, totpURI } = await personWithTwoStep()
    const right = totpFromUri(totpURI)
    // Near misses too: the right code with its last digit changed, and a code that is too short.
    const wrongs = [
      '000000',
      `${right.slice(0, 5)}${(Number(right[5]) + 1) % 10}`,
      right.slice(0, 5),
    ]
    for (const code of wrongs) {
      const res = await b.auth('/two-factor/disable', { password: 'Parkview-gate-2026', code })
      expect(res.status, code).toBe(400)
    }
    const [row] = await db.select().from(users).where(eq(users.id, user.id))
    expect(row?.twoFactorEnabled).toBe(true)
  })

  it('stays on after a wrong password with the right code, then a wrong code', async () => {
    const { b, user, totpURI } = await personWithTwoStep()
    const right = totpFromUri(totpURI)
    const first = await b.auth('/two-factor/disable', {
      password: 'Not-my-password-1',
      code: right,
    })
    expect(first.json.code).toBe('INVALID_PASSWORD')
    const second = await b.auth('/two-factor/disable', {
      password: 'Parkview-gate-2026',
      code: '000000',
    })
    expect(second.json.code).toBe('INVALID_CODE')
    const [row] = await db.select().from(users).where(eq(users.id, user.id))
    expect(row?.twoFactorEnabled).toBe(true)
  })
})
