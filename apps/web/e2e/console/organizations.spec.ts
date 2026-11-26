import { expect, type Page, test } from '@playwright/test'
import { openOrganization, signInToConsole } from '../support/console'
import {
  createStarterOrgFixture,
  createSuperAdminFixture,
  createTeamFixture,
  releaseFlags,
  setReleaseGroup,
} from '../support/fixtures'

// J-ADM-02 in the console: find an organization, see why a feature is or isn't there, move it to
// a plan, start a trial, add an override and an AI budget. Each test makes its own organization.

const REASON_HELP = "Kept in Vento's activity. The customer doesn't see it."

const sheet = (page: Page) => page.getByRole('dialog').first()

async function openMoreChange(page: Page, item: string) {
  await page.getByRole('button', { name: 'More changes' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Fills the reason on the review step and presses the button that names the change. */
async function confirmChange(page: Page, reason: string, button: string | RegExp) {
  await sheet(page).getByLabel('Reason').fill(reason)
  await sheet(page).getByRole('button', { name: button }).click()
}

test.describe('finding an organization', () => {
  test('searching by name opens its detail, and Features says why a feature is not available', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    releaseFlags(org.organizationId, ['sales', 'sales.commissions'])
    await signInToConsole(page, createSuperAdminFixture('member'))

    await openOrganization(page, org)
    await page.getByRole('button', { name: 'Not available' }).click()

    const row = page.getByTestId('feature-why').filter({ hasText: 'Commissions' })
    await expect(row).toContainText('Not available')
    await expect(row).toContainText('Not in Starter; in Growth and Enterprise')
  })

  test('the detail page shows the owner and plan, and the same plan card at a glance', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))

    await openOrganization(page, org)

    await expect(page.getByText(`owner ${org.owner.name} (${org.owner.email})`)).toBeVisible()
    await expect(page.getByText('Starter v1', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('1 of 2')).toBeVisible()
    await expect(page.getByText('No overrides.')).toBeVisible()
  })

  test('a search that matches nothing says so and Clear filters brings the list back', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))

    await expect(
      page
        .getByTestId('organization-row')
        .or(page.getByRole('list', { name: 'Organizations' }))
        .first(),
    ).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('searchbox', { name: /Search by organization/ }).fill('zzz-no-such-org')

    await expect(page.getByText('No organizations match these filters.')).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByText('No organizations match these filters.')).toHaveCount(0)
    await expect(page.getByRole('searchbox', { name: /Search by organization/ })).toHaveValue('')
  })

  test('the organization list is never showing members or buyers, only the owner', async ({
    page,
  }) => {
    const team = createTeamFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))

    await openOrganization(page, team)

    const others = Object.values(team.members).filter((m) => m.email !== team.members.owner?.email)
    for (const member of others) {
      await expect(page.getByText(member.email)).toHaveCount(0)
    }
  })
})

test.describe('changing a plan', () => {
  test('moving an organization over a limit shows the warning, needs a reason, and marks it over the limit', async ({
    page,
  }) => {
    const team = createTeamFixture()
    setReleaseGroup(team.organizationId, 'standard')
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, team)

    await page.getByRole('button', { name: 'Choose a plan' }).first().click()
    await sheet(page)
      .getByRole('radio', { name: /Starter/ })
      .click()
    await sheet(page).getByRole('button', { name: 'Review' }).click()

    await expect(sheet(page).getByText(/has 3 active companies; Starter includes 2/)).toBeVisible()
    await expect(sheet(page).getByText(REASON_HELP)).toBeVisible()
    await expect(sheet(page).getByRole('button', { name: 'Move to Starter' })).toBeDisabled()
    await confirmChange(page, 'Downgrade at their request', 'Move to Starter')

    await expect(page.getByText(/is now on Starter \(version 1\)/)).toBeVisible()
    await expect(page.getByText('3 of 2 · over the limit')).toBeVisible()
    await expect(page.getByText('Nothing is archived; new companies are refused.')).toBeVisible()
    await expect(page.getByText(`Moved ${team.organizationName} to Starter v1`)).toBeVisible()
  })

  test('an organization over a limit appears under the Over a limit chip', async ({ page }) => {
    const team = createTeamFixture()
    setReleaseGroup(team.organizationId, 'standard')
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, team)
    await page.getByRole('button', { name: 'Choose a plan' }).first().click()
    await sheet(page)
      .getByRole('radio', { name: /Starter/ })
      .click()
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await confirmChange(page, 'Downgrade at their request', 'Move to Starter')
    await expect(page.getByText('3 of 2 · over the limit')).toBeVisible()

    await page.getByRole('link', { name: 'Organizations', exact: true }).first().click()
    await page
      .getByRole('group', { name: 'Show' })
      .getByRole('button', { name: 'Over a limit' })
      .click()
    await page
      .getByRole('searchbox', { name: /Search by organization/ })
      .fill(team.organizationName)

    await expect(page.getByRole('link', { name: new RegExp(team.organizationName) })).toHaveCount(1)
  })

  test('a reason of two characters is refused with a message when the field is left, and three is enough', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await page.getByRole('button', { name: 'Change plan' }).click()
    await sheet(page)
      .getByRole('radio', { name: /Growth/ })
      .click()
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await sheet(page).getByLabel('Reason').fill('ab')
    await sheet(page).getByLabel('Reason').blur()

    await expect(sheet(page).getByText('Add a reason so the activity says why.')).toBeVisible()
    await expect(sheet(page).getByRole('button', { name: 'Move to Growth' })).toBeDisabled()
    await sheet(page).getByLabel('Reason').fill('abc')
    await expect(sheet(page).getByRole('button', { name: 'Move to Growth' })).toBeEnabled()
  })

  test('confirming from the keyboard with no reason shows the message instead of changing anything', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)
    await page.getByRole('button', { name: 'Change plan' }).click()
    await sheet(page)
      .getByRole('radio', { name: /Growth/ })
      .click()
    await sheet(page).getByRole('button', { name: 'Review' }).click()

    await sheet(page).getByLabel('Reason').press('Control+Enter')

    await expect(sheet(page).getByText('Add a reason so the activity says why.')).toBeVisible()
    await expect(page.getByText(/is now on Growth/)).toHaveCount(0)
  })

  test('a change made elsewhere after the preview is refused as stale, and the sheet stays open', async ({
    page,
    context,
  }) => {
    const org = createStarterOrgFixture()
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    await openOrganization(page, org)
    await page.getByRole('button', { name: 'Change plan' }).click()
    await sheet(page)
      .getByRole('radio', { name: /Enterprise/ })
      .click()
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await expect(sheet(page).getByLabel('Reason')).toBeVisible()

    const other = await context.newPage()
    await other.goto(page.url().split('?')[0] ?? '/console')
    await other.getByRole('button', { name: 'Change plan' }).click()
    await other
      .getByRole('dialog')
      .getByRole('radio', { name: /Growth/ })
      .click()
    await other.getByRole('dialog').getByRole('button', { name: 'Review' }).click()
    await other.getByRole('dialog').getByLabel('Reason').fill('First change')
    await other.getByRole('dialog').getByRole('button', { name: 'Move to Growth' }).click()
    await expect(other.getByText(/is now on Growth/)).toBeVisible()
    await other.close()

    await confirmChange(page, 'Second change', 'Move to Enterprise')

    await expect(sheet(page).getByRole('alert')).toContainText(/changed|moved|since/i)
    await expect(sheet(page).getByLabel('Reason')).toHaveValue('Second change')
  })
})

test.describe('trials, overrides and AI', () => {
  test('starting a trial previews it, asks for a reason, and shows the trial card and activity', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await openMoreChange(page, 'Start trial')
    await expect(sheet(page).getByRole('radio', { name: /Growth/ })).toBeChecked()
    await expect(sheet(page).getByLabel('Days')).toHaveValue('30')
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await confirmChange(page, 'Board pack trial', 'Start 30-day trial')

    await expect(page.getByText(/^Growth trial · ends .* \(30 days\)$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'End trial' })).toBeVisible()
  })

  test('a trial of 0 days is refused with its own message and nothing is previewed', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await openMoreChange(page, 'Start trial')
    await sheet(page).getByLabel('Days').fill('0')
    await sheet(page).getByRole('button', { name: 'Review' }).click()

    await expect(
      sheet(page)
        .getByRole('alert')
        .filter({ hasText: /1 to 90|days/i }),
    ).toBeVisible()
    await expect(sheet(page).getByLabel('Reason')).toHaveCount(0)
  })

  test('starting a second trial while one runs is refused and points to End trial', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)
    await openMoreChange(page, 'Start trial')
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await confirmChange(page, 'First trial', 'Start 30-day trial')
    await expect(page.getByText(/trial · ends/)).toBeVisible()

    await page.getByRole('button', { name: 'More changes' }).click()

    await expect(page.getByRole('menuitem', { name: 'Start trial' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'End trial' })).toBeVisible()
  })

  test('adding a companies override of 8 previews it and lists it under Overrides', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await openMoreChange(page, 'Add override')
    await sheet(page).getByRole('radio', { name: /^Plan/ }).click()
    await sheet(page).getByLabel('Feature or limit').selectOption({ label: 'Companies limit' })
    await sheet(page).getByLabel('Limit', { exact: true }).fill('8')
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await confirmChange(page, 'Negotiated: 8 companies', 'Set companies limit to 8')

    await expect(page.getByText('No overrides.')).toHaveCount(0)
    await expect(page.getByText(/Negotiated: 8 companies/).first()).toBeVisible()
    await expect(page.getByText('1 of 8')).toBeVisible()
  })

  test('an override with no limit value is refused with a message', async ({ page }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await openMoreChange(page, 'Add override')
    await sheet(page).getByRole('button', { name: 'Review' }).click()

    await expect(sheet(page).getByText('Choose a feature or limit.')).toBeVisible()
  })

  test('adding AI offers 150,000 naira, and changing the budget is a single sheet', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await openMoreChange(page, 'Add AI')
    await expect(sheet(page).getByLabel('Monthly budget')).toHaveValue('150,000')
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await confirmChange(page, 'AI pilot', 'Add AI')
    await expect(page.getByText(/₦150,000 a month/).first()).toBeVisible()

    await page.getByRole('button', { name: 'Change budget' }).click()
    await sheet(page).getByLabel('Monthly budget').fill('250000')
    await sheet(page).getByRole('button', { name: 'Review' }).click()
    await confirmChange(page, 'Raised after the pilot', /^Change to ₦250,000$/)

    await expect(page.getByText(/₦250,000 a month/).first()).toBeVisible()
  })

  test('an AI budget of zero is refused with a message', async ({ page }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)

    await openMoreChange(page, 'Add AI')
    await sheet(page).getByLabel('Monthly budget').fill('0')
    await sheet(page).getByRole('button', { name: 'Review' }).click()

    await expect(
      sheet(page)
        .getByRole('alert')
        .filter({ hasText: /above ₦0|budget/i }),
    ).toBeVisible()
  })
})
