import { expect, test } from '@playwright/test'
import { createMemberFixture } from '../support/fixtures'
import { newestEmail } from '../support/mailbox'
import { enterPassword } from '../support/sign-in'
import { totpCode } from '../support/totp'

/** The path and query of the first link in the newest reset email, so it opens on the e2e web server. */
async function resetLinkPath(email: string): Promise<string> {
  const mail = await newestEmail(email, 'reset_password')
  const link = mail.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error('No reset link in the email')
  const url = new URL(link)
  return `${url.pathname}${url.search}`
}

async function askForResetLink(page: import('@playwright/test').Page, email: string) {
  await page.goto('/forgot-password')
  await page.getByLabel('Work email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('If an account exists for')).toBeVisible()
}

test('forgot password: the emailed link sets a new password, then sign-in needs two-step', async ({
  page,
}) => {
  const member = createMemberFixture()
  const newPassword = 'Lagos-lagoon-2027'
  await askForResetLink(page, member.email)

  await page.goto(await resetLinkPath(member.email))
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm password').fill(newPassword)
  await page.getByRole('button', { name: 'Save and sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await enterPassword(page, member.email, newPassword)
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(totpCode(member.totpSecret))
  await expect(page.getByRole('heading', { name: /^Welcome, / })).toBeVisible()
})

test('forgot password: the same reply is shown for an email with no account', async ({ page }) => {
  await askForResetLink(page, `nobody.${Date.now().toString(36)}@test.vento.ng`)
})

test('reset password refuses the password the person already uses', async ({ page }) => {
  const member = createMemberFixture()
  await askForResetLink(page, member.email)

  await page.goto(await resetLinkPath(member.email))
  await page.getByLabel('New password', { exact: true }).fill(member.password)
  await page.getByLabel('Confirm password').fill(member.password)
  await page.getByRole('button', { name: 'Save and sign in' }).click()

  await expect(
    page.getByRole('listitem').filter({ hasText: /Not met:\s*Different from your last 5/ }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/reset-password/)
})

test('a reset link works only once', async ({ page }) => {
  const member = createMemberFixture()
  await askForResetLink(page, member.email)
  const path = await resetLinkPath(member.email)
  await page.goto(path)
  await page.getByLabel('New password', { exact: true }).fill('Lagos-lagoon-2027')
  await page.getByLabel('Confirm password').fill('Lagos-lagoon-2027')
  await page.getByRole('button', { name: 'Save and sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.goto(path)

  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0)
})
