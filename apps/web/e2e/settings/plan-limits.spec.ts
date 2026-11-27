import { expect } from '@playwright/test'
import { createStarterTeamFixture } from '../support/fixtures'
import { test } from '../support/shell'
import { signInAs } from '../support/sign-in'
import { chooseRole, openInviteSheet, openTeam, pasteEmails, uniqueAddress } from '../support/team'

// Creating these teams signs several people up for two-step, which is slow under load.
test.describe.configure({ timeout: 90_000 })

// J-ONB-02 Watch for: an owner with fewer places left than rows, and an admin hitting the limit.
// Starter fixture: three people in it, a limit of five, so two places are left.

const three = () => ['one', 'two', 'three'].map((n) => uniqueAddress(`limit${n}`))

test('an owner on Starter sees places left, Talk to Vento Real Estate, and Send disabled until the rows fit', async ({
  page,
}) => {
  const team = await createStarterTeamFixture(2)
  await signInAs(page, team.owner, team.password)
  await openTeam(page)
  await expect(page.getByText('3 of 5 people on your Starter plan')).toBeVisible()

  const sheet = await openInviteSheet(page)
  await pasteEmails(sheet, three().join('\n'))
  await chooseRole(sheet, 'Sales')

  await expect(sheet.getByText(/You have 2 places left on your Starter plan/)).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Talk to Vento Real Estate' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Send 3 invitations' })).toBeDisabled()

  await expect(sheet.getByText('No place left on your plan')).toBeVisible()
  await sheet.getByRole('button', { name: 'Send only 2' }).click()

  await expect(page.getByText('Invitations sent to 2 people')).toBeVisible()
  // The row that didn't fit stays for the owner to deal with.
  await expect(sheet.getByText('No place left on your plan')).toBeVisible()
  await expect(page.getByText('5 of 5 people on your Starter plan')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Talk to Vento Real Estate' })).toBeVisible()
})

test('an owner at the limit is told all places are taken and cannot send', async ({ page }) => {
  const team = await createStarterTeamFixture(0)
  await signInAs(page, team.owner, team.password)
  await openTeam(page)
  await expect(page.getByText('3 of 3 people on your Starter plan')).toBeVisible()

  const sheet = await openInviteSheet(page)
  await pasteEmails(sheet, uniqueAddress('full'))
  await chooseRole(sheet, 'Sales')

  await expect(sheet.getByText(/All 3 places on your Starter plan are taken/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Send invitation', exact: true })).toBeDisabled()
})

test('an admin never sees the plan, sends, is refused with who to ask, and the rows stay', async ({
  page,
}) => {
  const team = await createStarterTeamFixture(2)
  await signInAs(page, team.admin, team.password)
  await openTeam(page)
  await expect(page.getByText('3 people')).toBeVisible()
  await expect(page.getByText(/Starter/)).toHaveCount(0)

  const sheet = await openInviteSheet(page)
  const addresses = three()
  await pasteEmails(sheet, addresses.join('\n'))
  await chooseRole(sheet, 'Sales')
  await expect(sheet.getByText(/places left/)).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Send 3 invitations' }).click()

  await expect(
    sheet.getByText(
      `Your organization has reached its limit of ${team.limit} people. Ask ${team.owner.name} (owner).`,
    ),
  ).toBeVisible()
  await expect(sheet.getByText(/Starter/)).toHaveCount(0)
  for (const email of addresses) await expect(sheet.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByText('Invitations sent to')).toHaveCount(0)
})
