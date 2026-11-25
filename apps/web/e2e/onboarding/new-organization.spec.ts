import { expect, test } from '@playwright/test'
import { createHalfOnboardedFixture, createMemberFixture } from '../support/fixtures'
import { newestEmail, verificationCode } from '../support/mailbox'
import { enterPassword } from '../support/sign-in'
import { completeTwoStepSetup } from '../support/two-step'

// J-ONB-01: sign up, verify, create the organization and first entity, set up two-step.
test('a new owner signs up, sets up the organization and entity, and ends up signed in', async ({
  page,
}, testInfo) => {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const email = `e2e.signup.${testInfo.project.name}.${unique}@test.vento.ng`
  const password = 'Parkview-gate-2026'
  const company = `Lekki Gardens ${unique}`

  await page.goto('/sign-up')
  await page.getByLabel('Your name').fill('Amaka Obi')
  await page.getByLabel('Company').fill(company)
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('checkbox', { name: /I agree to the/ }).check()
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(await verificationCode(email))

  // Onboarding step 1: the company name carries over.
  await expect(page.getByRole('heading', { name: 'Your organization' })).toBeVisible()
  await expect(page.getByLabel('Organization name')).toHaveValue(company)
  await page.getByLabel('Head office state').selectOption({ label: 'Lagos' })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2: RC and TIN stay empty, which must not block.
  await expect(page.getByRole('heading', { name: 'First entity' })).toBeVisible()
  await expect(page.getByLabel('Entity name')).toHaveValue(company)
  await page.getByRole('button', { name: 'Finish setup' }).click()

  const secret = await completeTwoStepSetup(page, password)
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/)

  await expect(page.getByRole('heading', { name: 'Welcome, Amaka' })).toBeVisible()
  await expect(page.getByText(`You're signed in to ${company} as Owner.`)).toBeVisible()
})

test('a wrong verification code shows what to do and keeps the person on the page', async ({
  page,
}, testInfo) => {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const email = `e2e.badcode.${testInfo.project.name}.${unique}@test.vento.ng`

  await page.goto('/sign-up')
  await page.getByLabel('Your name').fill('Amaka Obi')
  await page.getByLabel('Company').fill(`Ikoyi Heights ${unique}`)
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Parkview-gate-2026')
  await page.getByRole('checkbox', { name: /I agree to the/ }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const real = await verificationCode(email)
  const wrong = real === '000000' ? '111111' : '000000'

  await page.getByLabel('6-digit code').fill(wrong)

  await expect(page.getByRole('alert').filter({ hasText: "didn't match" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
})

test('the sign-up form explains what is missing before sending anything', async ({ page }) => {
  await page.goto('/sign-up')

  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('Enter your full name')).toBeVisible()
  await expect(page.getByText('Enter your work email')).toBeVisible()
  // The password rules turn from grey to rose instead of a separate message.
  await expect(
    page.getByRole('listitem').filter({ hasText: /Not met:\s*At least 12 characters/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: /Not met:\s*Includes a number/ }),
  ).toBeVisible()
  await expect(page.getByText('Agree to the terms and privacy notice to continue')).toBeVisible()
})

test('signing up with an email that already has an account looks the same and emails the owner of it', async ({
  page,
}) => {
  const member = createMemberFixture()

  await page.goto('/sign-up')
  await page.getByLabel('Your name').fill('Someone Else')
  await page.getByLabel('Company').fill('Another Company Ltd')
  await page.getByLabel('Work email').fill(member.email)
  await page.getByLabel('Password', { exact: true }).fill('Parkview-gate-2026')
  await page.getByRole('checkbox', { name: /I agree to the/ }).check()
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const notice = await newestEmail(member.email, 'existing_account')
  expect(notice.subject).toBe('Someone tried to create a Vento account with your email')
  expect(notice.text).toContain('Your account is unchanged')
})

test('leaving after step 1 and signing in again resumes at step 2', async ({ page }) => {
  const person = createHalfOnboardedFixture()

  await page.goto('/sign-in')
  await enterPassword(page, person.email, person.password)

  await expect(page.getByRole('heading', { name: 'First entity' })).toBeVisible()
  await expect(page.getByLabel('Entity name')).toHaveValue(person.organizationName)
})

test('an RC or TIN in the wrong format warns but does not stop Finish setup', async ({ page }) => {
  const person = createHalfOnboardedFixture()
  await page.goto('/sign-in')
  await enterPassword(page, person.email, person.password)

  await page.getByLabel('RC number').fill('12')
  await page.getByLabel('TIN', { exact: true }).fill('abc')
  await page.getByRole('button', { name: 'Finish setup' }).click()

  await expect(page).toHaveURL(/\/two-step\/setup/)
})
