import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { createCustomRoleFixture } from '../support/fixtures'
import { signInAs } from '../support/sign-in'

// Serious and critical axe violations fail the build on the 3c screens, in both themes.

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  )
}

async function expectNoSeriousViolations(page: Page) {
  await settle(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([])
}

test.describe.configure({ timeout: 90_000 })

/** The grid where it fits; below that, the module list and its sheet of switches. */
async function tickDocumentsCreate(page: Page) {
  const box = page.getByRole('checkbox', { name: 'Documents & contracts: Create' })
  await expect(
    box.or(page.getByRole('button', { name: /^Documents & contracts: .* Change$/ })),
  ).toBeVisible()
  if (await box.isVisible()) {
    await box.click()
    return
  }
  await page.getByRole('button', { name: /^Documents & contracts: .* Change$/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Documents & contracts' })
  await sheet.getByRole('switch', { name: 'Documents & contracts: Create' }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
}

// null = the project's own size (a laptop, or a phone); 1024 is the narrowest laptop layout.
for (const width of [null, 1024] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} mode${width ? ` at ${width}px` : ''}`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        test.skip(
          width !== null && testInfo.project.name !== 'desktop',
          'width variants are laptop',
        )
        if (width) await page.setViewportSize({ width, height: 800 })
      })

      async function ownerPage(page: Page) {
        const fixture = createCustomRoleFixture('Site engineer')
        if (theme === 'dark')
          await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
        await signInAs(page, fixture.owner, fixture.password)
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
        return fixture
      }

      test(`Organization has no serious accessibility violations in ${theme} mode`, async ({
        page,
      }) => {
        await ownerPage(page)
        await page.goto('/settings/organization')
        await expect(page.getByLabel('Organization name')).toBeVisible()

        await expectNoSeriousViolations(page)
      })

      test(`Companies and the Add company sheet have no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        await ownerPage(page)
        await page.goto('/settings/companies')
        await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible()
        await expect(page.getByText(/^Vento Homes .* Ltd$/).first()).toBeVisible()
        await expectNoSeriousViolations(page)

        await page.getByRole('button', { name: 'Add company' }).first().click()
        await expect(page.getByRole('dialog', { name: 'Add company' })).toBeVisible()
        await expectNoSeriousViolations(page)
      })

      test(`Roles list and New role dialog have no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        await ownerPage(page)
        await page.goto('/settings/roles')
        await expect(page.getByText('Site engineer', { exact: true }).first()).toBeVisible()
        await expectNoSeriousViolations(page)

        await page.getByRole('button', { name: 'New role' }).first().click()
        await expect(page.getByRole('dialog', { name: 'New role' })).toBeVisible()
        await expectNoSeriousViolations(page)
      })

      test(`An editable role page with unsaved changes has no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        const fixture = await ownerPage(page)
        await page.goto(`/settings/roles/${fixture.role.id}`)
        await tickDocumentsCreate(page)
        await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeVisible()

        await expectNoSeriousViolations(page)
      })

      test(`A read-only built-in role page has no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        await ownerPage(page)
        await page.goto('/settings/roles')
        await page.getByText('Project manager', { exact: true }).first().click()
        await expect(page.getByRole('heading', { name: 'Project manager', level: 1 })).toBeVisible()

        await expectNoSeriousViolations(page)
      })
    })
  }
}
