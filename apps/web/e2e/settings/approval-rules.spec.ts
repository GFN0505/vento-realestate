import { expect, type Page, test } from '@playwright/test'
import { createApprovalsTeamFixture } from '../support/fixtures'
import { signInAs } from '../support/sign-in'

// J-ONB-12: set approval rules. The rules table is a laptop layout (below 1280 px it is cards),
// so the editing flows run on the desktop project; read-only has a phone test at the end.

test.describe.configure({ timeout: 120_000 })

const MAKE_OWNER = 'Make someone an owner'
const ROLE_CHANGE = "Change a role's permissions"

const ruleRow = (page: Page, action: string) => page.getByRole('row').filter({ hasText: action })

async function openRules(page: Page) {
  await page.goto('/settings/approval-rules')
  await expect(page.getByRole('heading', { name: 'Approval rules', level: 1 })).toBeVisible()
}

test.describe('as an owner on a laptop', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the rules table is a laptop layout')
  })

  test('the two default rules read who approves each', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)

    await openRules(page)

    await expect(ruleRow(page, ROLE_CHANGE)).toContainText('Owner or Admin')
    await expect(ruleRow(page, ROLE_CHANGE)).toContainText('All companies')
    await expect(ruleRow(page, MAKE_OWNER)).toContainText('Owner')
    await expect(page.getByRole('button', { name: 'Add rule' })).toBeVisible()
  })

  test('adds a rule for one company and shows it with a saved message', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openRules(page)

    await page.getByRole('button', { name: 'Add rule' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add rule' })
    await sheet.getByLabel('Action').selectOption({ label: ROLE_CHANGE })
    await sheet
      .getByRole('group', { name: 'Step 1 roles' })
      .getByRole('button', { name: 'Admin' })
      .click()
    await sheet.getByRole('radio', { name: 'Only some companies' }).click()
    await sheet.getByRole('checkbox', { name: team.parkview.name }).click()
    await sheet.getByRole('button', { name: 'Save rule' }).click()

    await expect(page.getByText('Rule saved. Applies to new requests.')).toBeVisible()
    await expect(sheet).toBeHidden()
    const added = page.getByRole('row').filter({ hasText: team.parkview.name })
    await expect(added).toContainText(ROLE_CHANGE)
    await expect(added).toContainText('Admin')
  })

  test('refuses a rule with no approver on the field and keeps the sheet open', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openRules(page)

    await page.getByRole('button', { name: 'Add rule' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add rule' })
    await sheet.getByRole('button', { name: 'Save rule' }).click()

    await expect(sheet.getByText('Choose at least one role for each step')).toBeVisible()
    await expect(sheet).toBeVisible()
  })

  test('refuses a second rule for the same action and companies with the server message', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openRules(page)

    await page.getByRole('button', { name: 'Add rule' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add rule' })
    await sheet.getByLabel('Action').selectOption({ label: ROLE_CHANGE })
    await sheet
      .getByRole('group', { name: 'Step 1 roles' })
      .getByRole('button', { name: 'Owner' })
      .click()
    await sheet.getByRole('button', { name: 'Save rule' }).click()

    await expect(
      sheet.getByText(`There's already a rule for ${ROLE_CHANGE} in all companies.`),
    ).toBeVisible()
    await expect(sheet).toBeVisible()
  })

  test('edits who approves and the row changes', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openRules(page)

    await ruleRow(page, MAKE_OWNER).getByRole('button', { name: MAKE_OWNER, exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Edit rule' })
    await sheet
      .getByRole('group', { name: 'Step 1 roles' })
      .getByRole('button', { name: 'Admin' })
      .click()
    await sheet.getByRole('button', { name: 'Save rule' }).click()

    await expect(page.getByText('Rule saved. Applies to new requests.')).toBeVisible()
    await expect(ruleRow(page, MAKE_OWNER)).toContainText('Owner or Admin')
  })

  test('deletes a rule after a confirm, and Undo puts it back', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openRules(page)

    await page.getByRole('button', { name: /^Actions for Make someone an owner/ }).click()
    await page.getByRole('menuitem', { name: 'Delete rule' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this rule?' })
    await expect(confirm).toContainText('Every other owner is emailed.')
    await confirm.getByRole('button', { name: 'Delete rule' }).click()

    await expect(page.getByText('Rule deleted')).toBeVisible()
    await expect(ruleRow(page, MAKE_OWNER)).toContainText('No approval needed. It happens at once.')
    await page.getByRole('button', { name: 'Undo' }).click()

    await expect(page.getByText('Rule put back')).toBeVisible()
    await expect(ruleRow(page, MAKE_OWNER)).not.toContainText('No approval needed')
    await expect(ruleRow(page, MAKE_OWNER)).toContainText('Owner')
  })

  test('closing a changed sheet asks before throwing the change away', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openRules(page)
    await ruleRow(page, MAKE_OWNER).getByRole('button', { name: MAKE_OWNER, exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Edit rule' })
    await sheet
      .getByRole('group', { name: 'Step 1 roles' })
      .getByRole('button', { name: 'Admin' })
      .click()

    await sheet.getByRole('button', { name: 'Cancel' }).click()

    const ask = page.getByRole('alertdialog', { name: 'Discard your changes?' })
    await ask.getByRole('button', { name: 'Discard changes' }).click()
    await expect(sheet).toBeHidden()
    await expect(ruleRow(page, MAKE_OWNER)).not.toContainText('Owner or Admin')
  })
})

test.describe('as an admin', () => {
  test('rules are read-only with the reason and nothing to change them', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.admin, team.password)

    await openRules(page)

    await expect(page.getByText('Only owners can change approval rules.')).toBeVisible()
    await expect(page.getByText(ROLE_CHANGE).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add rule' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(0)
  })

  test('a rule address with ?rule=new does not open the editor', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.admin, team.password)

    await page.goto('/settings/approval-rules?rule=new')

    await expect(page.getByText('Only owners can change approval rules.')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
