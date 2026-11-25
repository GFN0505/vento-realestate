import { expect, test } from '@playwright/test'
import { createInvitationFixture } from '../support/fixtures'
import { completeTwoStepSetup } from '../support/two-step'

// J-ONB-02 step 4: the invitee's side.
test('a new person accepts a Finance invitation, sets up two-step and lands signed in', async ({
  page,
}) => {
  const invite = createInvitationFixture()
  const password = 'Gate-keeper-2026'

  await page.goto(`/accept-invitation/${invite.token}`)

  await expect(page.getByText(invite.organizationName, { exact: true })).toBeVisible()
  await expect(page.getByText(new RegExp(`${invite.inviterName} invited you`))).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Join as Finance' })).toBeVisible()
  await expect(page.getByText('Can approve')).toBeVisible()
  await expect(page.getByText('Required for this role')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(invite.email)

  await page.getByLabel('Your name').fill('Chidi Eze')
  await page.getByLabel('Create a password').fill(password)
  await page.getByRole('button', { name: 'Accept and set up two-step' }).click()

  await completeTwoStepSetup(page, password)

  await expect(page.getByRole('heading', { name: 'Welcome, Chidi' })).toBeVisible()
  await expect(
    page.getByText(`You're signed in to ${invite.organizationName} as Finance.`),
  ).toBeVisible()
})

test('an invitation link that does not exist says so instead of showing a form', async ({
  page,
}) => {
  await page.goto('/accept-invitation/this-token-does-not-exist-0000000000000')

  await expect(page.getByRole('button', { name: /Accept/ })).toHaveCount(0)
  await expect(page.getByText(/invitation/i).first()).toBeVisible()
})
