import { expect, test } from '@playwright/test'
import {
  ageSessions,
  createMemberFixture,
  createResetByAdminFixture,
  createUnverifiedFixture,
} from '../support/fixtures'
import { newestEmail } from '../support/mailbox'
import {
  enterPassword,
  expectOnOrganization,
  HOME_GREETING,
  runCommand,
  signInWithTotp,
} from '../support/sign-in'
import { totpCode } from '../support/totp'

// J-ONB-04: password, then the two-step check, then signed in; then sign out everywhere.
test('a member with two-step signs in, is refused a wrong code, then gets in with the right one', async ({
  page,
}) => {
  const member = createMemberFixture()

  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(member.email)
  await page.getByLabel('Password', { exact: true }).fill(member.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
  const right = totpCode(member.totpSecret)
  const wrong = right === '000000' ? '111111' : '000000'
  await page.getByLabel('6-digit code').fill(wrong)

  const message = page.getByRole('alert').filter({ hasText: "That code didn't match" })
  await expect(message).toBeVisible()
  await expect(page.getByLabel('6-digit code')).toHaveAttribute('aria-invalid', 'true')

  await page.getByLabel('6-digit code').fill(right)

  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Olumide$/ }),
  ).toBeVisible()
  await expectOnOrganization(page, member.organizationName)
})

test('a wrong password gets the same message as an unknown email', async ({ page }) => {
  const member = createMemberFixture()
  const reply = page.getByText('Invalid email or password', { exact: true })

  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(member.email)
  await page.getByLabel('Password', { exact: true }).fill('Not-the-password-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(reply).toBeVisible()
  const forWrongPassword = await reply.textContent()

  await page
    .getByLabel('Work email')
    .fill(
      `nobody.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@test.vento.ng`,
    )
  await page.getByLabel('Password', { exact: true }).fill('Not-the-password-1')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(reply).toHaveText(forWrongPassword ?? '')
})

test('signing out returns to sign-in and protects the home page', async ({ page }) => {
  const member = createMemberFixture()
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(member.email)
  await page.getByLabel('Password', { exact: true }).fill(member.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByLabel('6-digit code').fill(totpCode(member.totpSecret))
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Olumide$/ }),
  ).toBeVisible()

  await runCommand(page, 'Sign out')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('five wrong two-step codes lock sign-in and show how long to wait', async ({ page }) => {
  const member = createMemberFixture()
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(member.email)
  await page.getByLabel('Password', { exact: true }).fill(member.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
  const right = totpCode(member.totpSecret)
  const wrong = right === '000000' ? '111111' : '000000'

  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByLabel('6-digit code').fill(wrong)
    await expect(page.getByRole('alert')).toBeVisible()
    if (attempt < 5) await expect(page.getByLabel('6-digit code')).toHaveValue('')
  }

  await expect(page.getByRole('alert')).toContainText('Too many wrong codes')
  await expect(page.getByRole('alert')).toContainText('Try again in')
  await expect(page.getByLabel('6-digit code')).toBeDisabled()
})

test('signing in before verifying the email sends the person to the verify step', async ({
  page,
}) => {
  const person = createUnverifiedFixture()

  await page.goto('/sign-in')
  await enterPassword(page, person.email, person.password)

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(person.email)).toBeVisible()
})

test('a backup code signs in once and is refused the second time', async ({ page }) => {
  const member = createMemberFixture()
  const [code] = member.backupCodes
  if (!code) throw new Error('fixture has no backup codes')

  async function signInWithBackupCode() {
    await page.goto('/sign-in')
    await enterPassword(page, member.email, member.password)
    await page.getByRole('button', { name: 'Use a backup code' }).click()
    await page.getByLabel('Backup code').fill(code as string)
    await page.getByRole('button', { name: 'Verify' }).click()
  }

  await signInWithBackupCode()
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  await runCommand(page, 'Sign out')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await signInWithBackupCode()

  await expect(page.getByRole('alert')).toContainText('used already')
})

test('after an admin resets two-step, sign-in says to set a new password first', async ({
  page,
}) => {
  const person = createResetByAdminFixture()

  await page.goto('/sign-in')
  await enterPassword(page, person.email, person.password)

  await expect(
    page.getByText(
      'Your two-step sign-in was reset. Set a new password with the link we emailed you, then sign in.',
    ),
  ).toBeVisible()
  const mail = await newestEmail(person.email, 'reset_password')
  expect(mail.text).toMatch(/https?:\/\//)
})

test('an expired session shows the sign-in-again dialog and keeps the page', async ({ page }) => {
  const member = createMemberFixture()
  await signInWithTotp(page, member)
  ageSessions(member.email)

  await runCommand(page, 'Sign out everywhere else')

  await expect(page.getByRole('heading', { name: 'Your session has ended' })).toBeVisible()
  await page.getByLabel(`Password for ${member.email}`).fill(member.password)
  await page.getByRole('button', { name: 'Sign in again' }).click()
  await page.getByLabel('6-digit code').fill(totpCode(member.totpSecret))
  await expect(page.getByRole('heading', { name: 'Your session has ended' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
})
