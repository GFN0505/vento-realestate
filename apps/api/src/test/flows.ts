import { CURRENT_TERMS_VERSION } from '@vento/shared'
import type { createMemoryTransport } from '@/email/transports/memory'
import { type browser, codeFromEmail, totpFromUri } from './auth-client'
import { TEST_PASSWORD } from './factories'

type Browser = ReturnType<typeof browser>
type Mailer = ReturnType<typeof createMemoryTransport>

export function signUp(b: Browser, email: string, overrides: Record<string, unknown> = {}) {
  return b.auth('/sign-up/email', {
    name: 'Olumide Bankole',
    email,
    password: TEST_PASSWORD,
    companyName: 'Vento Homes Ltd',
    termsVersion: CURRENT_TERMS_VERSION,
    ...overrides,
  })
}

/** Sign up and verify with the emailed code: ends signed in (auto sign-in after verification). */
export async function signUpVerified(b: Browser, mailer: Mailer, email: string) {
  await signUp(b, email)
  const res = await b.auth('/email-otp/verify-email', { email, otp: codeFromEmail(mailer, email) })
  if (res.status !== 200) throw new Error(`verify failed: ${JSON.stringify(res.json)}`)
}

/** Onboarding steps 1 and 2. */
export async function onboard(b: Browser, name = 'Vento Homes Ltd') {
  await b.rpc('onboarding/createOrganization', { name, headOfficeState: 'Lagos' })
  const res = await b.rpc('onboarding/createFirstEntity', { name, type: 'holding' })
  if (res.status !== 200) throw new Error(`onboarding failed: ${JSON.stringify(res.body)}`)
}

/** Scan, confirm with a code: returns the authenticator URI and the 10 backup codes. */
export async function setUpTwoStep(b: Browser, password = TEST_PASSWORD) {
  const enabled = await b.auth('/two-factor/enable', { password })
  const totpURI = String(enabled.json.totpURI)
  const backupCodes = enabled.json.backupCodes as string[]
  const verified = await b.auth('/two-factor/verify-totp', { code: totpFromUri(totpURI) })
  if (verified.status !== 200)
    throw new Error(`two-step setup failed: ${JSON.stringify(verified.json)}`)
  return { totpURI, backupCodes }
}

export function signIn(b: Browser, email: string, password = TEST_PASSWORD, rememberMe = false) {
  return b.auth('/sign-in/email', { email, password, rememberMe })
}
