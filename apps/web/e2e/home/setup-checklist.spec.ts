import { expect } from '@playwright/test'
import { createMemberFixture } from '../support/fixtures'
import { test } from '../support/shell'
import { HOME_GREETING, runCommand, signInWithTotp } from '../support/sign-in'
import { chooseRole, pasteEmails, uniqueAddress } from '../support/team'

// J-ONB-01 step 7: the setup checklist on Home, for owners and admins.

test('a new owner sees three of four done and Invite your team open', async ({ page }) => {
  const owner = createMemberFixture()
  await signInWithTotp(page, owner)

  const card = page.getByRole('region', { name: 'Finish setting up' })
  await expect(card).toContainText('3 of 4 done')
  await expect(card).toContainText('3 steps done')
  await expect(card).toContainText('two-step sign-in')
  await expect(card.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
    'aria-valuenow',
    '3',
  )
  await expect(card.getByText('Invite your team, to do')).toBeVisible()
})

test('Invite people opens the invite sheet over Home, and sending completes the checklist', async ({
  page,
}) => {
  const owner = createMemberFixture()
  await signInWithTotp(page, owner)
  const card = page.getByRole('region', { name: 'Finish setting up' })

  await card.getByRole('button', { name: 'Invite people' }).click()
  const sheet = page.getByRole('dialog', { name: 'Invite people' })
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await pasteEmails(sheet, uniqueAddress('first'))
  await chooseRole(sheet, 'Sales')
  await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()

  await expect(page.getByText(/^Invitation sent to /)).toBeVisible()
  await expect(card).toContainText('4 of 4 done')
  await expect(card).toContainText(
    "You're set up. New steps appear here as you add projects and sales.",
  )
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
})

test('hiding the checklist offers Undo, and the command palette brings it back', async ({
  page,
}) => {
  const owner = createMemberFixture()
  await signInWithTotp(page, owner)
  const card = page.getByRole('region', { name: 'Finish setting up' })

  await card.getByRole('button', { name: 'Checklist options' }).click()
  await page.getByRole('menuitem', { name: 'Hide checklist' }).click()
  await expect(page.getByText('Checklist hidden')).toBeVisible()
  await expect(card).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Checklist options' }).click()
  await page.getByRole('menuitem', { name: 'Hide checklist' }).click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  await expect(card).toHaveCount(0)

  await runCommand(page, 'Show setup checklist')
  await expect(card).toBeVisible()
})

test('the checklist stays hidden for a person who never sees it: sales and finance', async ({
  as,
}) => {
  for (const role of ['sales', 'finance']) {
    const page = await as(role)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Finish setting up' })).toHaveCount(0)
    await expect(page.getByText('Finish setting up')).toHaveCount(0)
  }
})

test('an admin sees the checklist, and previewing Sales hides it', async ({ as }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the preview menu lives in More on phones')
  const page = await as('admin')
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Finish setting up' })
  await expect(card).toBeVisible()

  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('menuitem', { name: 'Preview as role' }).click()
  await page.getByRole('menuitemradio', { name: 'Sales' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Previewing as Sales.' })).toBeVisible()
  await expect(card).toHaveCount(0)
})
