import { expect, type Page, test } from '@playwright/test'
import {
  expectNoSeriousViolations,
  openOrganization,
  signInToConsole,
  useTheme,
} from '../support/console'
import { createStarterOrgFixture, createSuperAdminFixture } from '../support/fixtures'

// Plans: the list, a plan's versions side by side, and publishing a new version through the
// stepped sheet. Publishing is global and permanent (versions are append-only), so the one test
// that publishes runs on the desktop project only and changes only Growth's People limit.

const dialog = (page: Page) => page.getByRole('dialog').first()

test.describe('plans', () => {
  test('the list shows each plan with who is on which version, and the default for new organizations', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans')

    await expect(page.getByRole('heading', { name: 'Plans', level: 1 })).toBeVisible()
    const rows = page.getByTestId('plan-row')
    await expect(rows.filter({ hasText: 'Starter' })).toContainText(/organization/)
    await expect(rows.filter({ hasText: 'Growth' })).toBeVisible()
    await expect(rows.filter({ hasText: 'Enterprise' })).toBeVisible()
    await expect(page.getByText('Default for new organizations')).toHaveCount(1)
  })

  test('a plan page shows its versions with the features by module and the limits', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans')

    await page.getByTestId('plan-row').filter({ hasText: 'Growth' }).click()

    await expect(page.getByRole('heading', { name: 'Growth', level: 1 })).toBeVisible()
    await expect(page.getByText('Latest', { exact: true })).toBeVisible()
    await expect(page.getByText('Companies', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('People', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/AI budget base/).first()).toBeVisible()
  })

  test('a plan that does not exist is a 404 inside the console', async ({ page }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans/no_such_plan')

    await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
  })

  test('a new plan with no key is refused with a message and nothing is previewed', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans')

    await page.getByRole('button', { name: 'New plan' }).click()
    await dialog(page).getByRole('button', { name: 'Review' }).click()

    await expect(dialog(page).getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible()
    await expect(dialog(page).getByLabel('Reason')).toHaveCount(0)
  })
})

test.describe('publishing a new version (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'Publishing is global, so only the desktop project does it')

  test('Growth v-next is previewed as a diff, moves nobody, and an organization on the old version is offered it', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openOrganization(page, org)
    await page.getByRole('button', { name: 'Change plan' }).click()
    await dialog(page)
      .getByRole('radio', { name: /Growth/ })
      .click()
    await dialog(page).getByRole('button', { name: 'Review' }).click()
    await dialog(page).getByLabel('Reason').fill('Signed annual Growth')
    await dialog(page).getByRole('button', { name: 'Move to Growth' }).click()
    await expect(page.getByText(/^Growth v\d+$/)).toBeVisible()
    const onVersion = Number(
      /v(\d+)/.exec((await page.getByText(/^Growth v\d+$/).textContent()) ?? '')?.[1],
    )

    await page.goto('/console/plans/growth')
    await page.getByRole('button', { name: /^Publish v\d+$/ }).click()
    const members = dialog(page).getByLabel('People', { exact: true })
    const current = Number(await members.inputValue())
    await members.fill(String(current + 1))
    await dialog(page).getByRole('button', { name: 'Review' }).click()

    await expect(
      dialog(page)
        .getByText(/People/)
        .first(),
    ).toBeVisible()
    await expect(
      dialog(page).getByText(/stay on Growth v\d+ or earlier until you move them/),
    ).toBeVisible()
    await dialog(page).getByLabel('Reason').fill('Raise the People limit by one')
    await dialog(page)
      .getByRole('button', { name: /^Publish Growth v\d+$/ })
      .click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByText('Latest', { exact: true })).toBeVisible()

    await page.goto('/console')
    await openOrganization(page, org)
    await expect(page.getByText(`Growth v${onVersion}`, { exact: true })).toBeVisible()
    await expect(page.getByText(/^Growth v\d+ is available$/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Move to v\d+$/ })).toBeVisible()
  })
})

for (const theme of ['light', 'dark'] as const) {
  test(`Plans list has no serious accessibility violations in ${theme} mode`, async ({ page }) => {
    await useTheme(page, theme)
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans')
    await expect(page.getByTestId('plan-row').first()).toBeVisible()

    await expectNoSeriousViolations(page)
  })

  test(`Plan page has no serious accessibility violations in ${theme} mode`, async ({ page }) => {
    await useTheme(page, theme)
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans/starter')
    await expect(page.getByRole('heading', { name: 'Starter', level: 1 })).toBeVisible()

    await expectNoSeriousViolations(page)
  })
}

// KNOWN APP BUG (reported, not fixed here): with several versions the plan page's strip of version
// cards is a horizontal scroller (-mx-4 overflow-x-auto) that keyboard users can't focus
// (axe scrollable-region-focusable). Needs two or more Growth versions, so it skips on a fresh DB.
test('the strip of version cards on a plan with several versions is keyboard focusable', async ({
  page,
}) => {
  await signInToConsole(page, createSuperAdminFixture('member'), '/console/plans/growth')
  await expect(page.getByRole('heading', { name: 'Growth', level: 1 })).toBeVisible()
  const versions = await page.getByText('Published ').count()
  test.skip(versions < 2, 'Growth has one version here; the strip does not scroll')
  test.fail(true, 'Version strip is a scroll region that is not keyboard focusable')

  await expectNoSeriousViolations(page)
})
