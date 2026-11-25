import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { sessions, users } from '@/db/schema'
import { browser, testApp } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { signIn, signUpVerified } from '@/test/flows'

async function signedIn(rememberMe = false) {
  const { app, mailer } = testApp()
  const email = uniqueEmail()
  await signUpVerified(browser(app), mailer, email)
  const b = browser(app)
  await signIn(b, email, undefined, rememberMe)
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const userId = user?.id ?? ''
  // The newest session is the one this browser holds.
  const current = async () => {
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(sql`created_at desc`)
    return rows[0]
  }
  return { app, b, email, userId, current }
}

async function age(id: string, column: 'last_active_at' | 'created_at', minutes: number) {
  await db.execute(
    sql`update sessions set ${sql.raw(column)} = now() - make_interval(mins => ${minutes}) where id = ${id}`,
  )
}

describe('session policy over HTTP', () => {
  it('ends a session after 31 minutes idle and says so', async () => {
    const { b, current } = await signedIn()
    const session = await current()
    await age(session?.id ?? '', 'last_active_at', 31)
    const res = await b.rpc('account/me')
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ data: { reason: 'session_expired' } })
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, session?.id ?? '')),
    ).toHaveLength(0)
  })

  it('ends a session 12 hours after sign-in even when active', async () => {
    const { b, current } = await signedIn()
    await age((await current())?.id ?? '', 'created_at', 12 * 60 + 1)
    expect((await b.rpc('account/me')).status).toBe(401)
  })

  it('keeps a "keep me signed in" session through idle time', async () => {
    const { b, current } = await signedIn(true)
    await age((await current())?.id ?? '', 'last_active_at', 120)
    expect((await b.rpc('account/me')).status).toBe(200)
  })

  it('records activity at most once a minute', async () => {
    const { b, current } = await signedIn()
    const before = (await current())?.lastActiveAt
    await b.rpc('account/me')
    expect((await current())?.lastActiveAt).toEqual(before)
    await age((await current())?.id ?? '', 'last_active_at', 2)
    await b.rpc('account/me')
    expect((await current())?.lastActiveAt.getTime()).toBeGreaterThan(Date.now() - 10_000)
  })

  it('also stops Better Auth serving an idle session', async () => {
    const { b, current } = await signedIn()
    await age((await current())?.id ?? '', 'last_active_at', 31)
    const res = await b.authGet('/get-session')
    expect(res.json).toBeNull()
  })
})

describe('sessions list and revoke', () => {
  it('lists my sessions with the device, no full IP, and marks this one', async () => {
    const { app, b, email } = await signedIn()
    await signIn(browser(app, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1'), email)
    const res = await b.rpc('account/sessions/list', {})
    const items = res.body.items as {
      isCurrent: boolean
      device: string
      browser: string
      ipMasked: string | null
    }[]
    expect(items.filter((s) => s.isCurrent)).toHaveLength(1)
    expect(items.find((s) => s.isCurrent)).toMatchObject({ device: 'Mac', browser: 'Chrome' })
    expect(items.some((s) => s.device === 'iPhone')).toBe(true)
  })

  it('ignores a client-supplied IP header', async () => {
    const { app } = testApp()
    const res = await app.request('/health', { headers: { 'x-vento-client-ip': '1.2.3.4' } })
    expect(res.status).toBe(200)
    const { current, b } = await signedIn()
    await b.rpc('account/me')
    expect((await current())?.ipAddress ?? '').not.toContain('1.2.3.4')
  })

  it('refuses a revoked session on its very next request', async () => {
    const { app, b, email } = await signedIn()
    const other = browser(app)
    await signIn(other, email)
    const out = await b.rpc('account/sessions/revokeOthers')
    // The other browser, plus the one that verified the email.
    expect(out.body).toEqual({ count: 2, notice: 'Signed out of 2 other devices' })
    const res = await other.rpc('account/me')
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ data: { reason: 'session_expired' } })
  })

  it("treats someone else's session id as not found", async () => {
    const a = await signedIn()
    const z = await signedIn()
    const theirs = await z.current()
    const res = await a.b.rpc('account/sessions/revoke', { id: theirs?.id })
    expect(res.status).toBe(404)
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, theirs?.id ?? '')),
    ).toHaveLength(1)
  })

  it('answers signed_out without a cookie', async () => {
    const { app } = testApp()
    const res = await browser(app).rpc('account/me')
    expect(res.body).toMatchObject({ data: { reason: 'signed_out' } })
  })
})
