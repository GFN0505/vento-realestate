import { describe, expect, it } from 'vitest'
import { browser, testApp } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { setUpTwoStep, signUpVerified } from '@/test/flows'
import { DISABLED_AUTH_PATHS } from './auth'

describe('Better Auth routes we switch off', () => {
  it.each(DISABLED_AUTH_PATHS)('%s answers 404 to a signed-in person', async (path) => {
    const { app, mailer } = testApp()
    const b = browser(app)
    await signUpVerified(b, mailer, uniqueEmail('probe'))
    const res = await b.auth(path, { password: 'Parkview-gate-2026', id: 'x', token: 'x' })
    expect(res.status).toBe(404)
  })

  it('never shows the authenticator secret again, even with the right password', async () => {
    const { app, mailer } = testApp()
    const b = browser(app)
    await signUpVerified(b, mailer, uniqueEmail('probe'))
    await setUpTwoStep(b)
    const res = await b.auth('/two-factor/get-totp-uri', { password: 'Parkview-gate-2026' })
    expect(res.status).toBe(404)
    expect(JSON.stringify(res.json)).not.toContain('otpauth')
  })
})
