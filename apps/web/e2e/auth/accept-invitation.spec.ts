import { expect, test } from '@playwright/test'
import { createInvitationFixture, createMemberFixture } from '../support/fixtures'
import { expectOnOrganization, signInWithTotp } from '../support/sign-in'
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
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Accept and set up two-step' }).click()

  await completeTwoStepSetup(page, password)

  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Chidi$/ }),
  ).toBeVisible()
  await expectOnOrganization(page, invite.organizationName)
  await expect(page.getByText('Cash, all entities')).toBeVisible()
})

test('an invitation link that does not exist says so instead of showing a form', async ({
  page,
}) => {
  await page.goto('/accept-invitation/this-token-does-not-exist-0000000000000')

  await expect(page.getByRole('button', { name: /Accept/ })).toHaveCount(0)
  await expect(page.getByText(/invitation/i).first()).toBeVisible()
})

test('an expired invitation says so and offers sign-in, not a form', async ({ page }) => {
  const invite = createInvitationFixture('expired')

  await page.goto(`/accept-invitation/${invite.token}`)

  await expect(page.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible()
  await expect(page.getByText(`Ask ${invite.inviterName} to send a new one.`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible()
  await expect(page.getByLabel('Create a password')).toHaveCount(0)
})

test('a withdrawn invitation says so and names who to ask', async ({ page }) => {
  const invite = createInvitationFixture('withdrawn')

  await page.goto(`/accept-invitation/${invite.token}`)

  await expect(page.getByRole('heading', { name: 'This invitation was withdrawn' })).toBeVisible()
  await expect(page.getByText(`Ask ${invite.inviterName} if you still need access`)).toBeVisible()
  await expect(page.getByLabel('Create a password')).toHaveCount(0)
})

test('opening an invitation while signed in as someone else offers to sign out first', async ({
  page,
}) => {
  const member = createMemberFixture()
  const invite = createInvitationFixture()
  await signInWithTotp(page, member)

  await page.goto(`/accept-invitation/${invite.token}`)

  await expect(page.getByText(`This invitation is for ${invite.email}.`)).toBeVisible()
  await expect(page.getByText(`You're signed in as ${member.email}.`)).toBeVisible()
  await page.getByRole('button', { name: 'Sign out and continue' }).click()
  await expect(page.getByLabel('Create a password')).toBeVisible()
})
