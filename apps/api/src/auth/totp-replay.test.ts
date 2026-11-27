import { describe, expect, it } from 'vitest'
import { browser, testApp, totpFromUri } from '@/test/auth-client'
import { uniqueEmail, uniqueSuffix } from '@/test/db'
import { onboard, setUpTwoStep, signIn, signUpVerified } from '@/test/flows'

// Audit L4: an authenticator code works once. These commit (Better Auth runs on the pool).

describe('authenticator codes at sign-in', () => {
  it('refuse a code already used, and take the next one', async () => {
    const { app, mailer } = testApp()
    const email = uniqueEmail('replay')
    const setUp = browser(app)
    await signUpVerified(setUp, mailer, email)
    await onboard(setUp, `Replay Homes ${uniqueSuffix()}`.slice(0, 60))
    const { totpURI } = await setUpTwoStep(setUp)
    const code = totpFromUri(totpURI)

    const first = browser(app)
    await signIn(first, email)
    expect((await first.auth('/two-factor/verify-totp', { code })).status).toBe(200)

    const again = browser(app)
    await signIn(again, email)
    const replayed = await again.auth('/two-factor/verify-totp', { code })
    expect(replayed.status).toBe(401)
    expect(replayed.json.code).toBe('INVALID_CODE')

    // The authenticator's next code (the plugin accepts one step ahead) is a new one.
    const next = totpFromUri(totpURI, Date.now() + 30_000)
    expect((await again.auth('/two-factor/verify-totp', { code: next })).status).toBe(200)
  })
})
