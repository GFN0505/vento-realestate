import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { test } from '../support/shell'
import { openInviteSheet, openTeam, pasteEmails, uniqueAddress } from '../support/team'

// Serious and critical axe violations fail the build on the Team screens, in both themes.

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

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} mode`, () => {
    test(`Team list has no serious accessibility violations in ${theme} mode`, async ({ as }) => {
      const page = await as('owner')
      if (theme === 'dark')
        await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      await openTeam(page)
      await expect(page.getByText('Grace Umeh').first()).toBeVisible()
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)

      await expectNoSeriousViolations(page)
    })

    test(`Invite sheet with rows and a problem has no serious accessibility violations in ${theme} mode`, async ({
      as,
    }) => {
      const page = await as('owner')
      if (theme === 'dark')
        await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      await openTeam(page)
      const sheet = await openInviteSheet(page)
      await pasteEmails(sheet, [uniqueAddress('axe'), 'not-an-email.com'].join('\n'))
      await expect(sheet.getByText('Check this email')).toBeVisible()

      await expectNoSeriousViolations(page)
    })

    test(`Member sheet has no serious accessibility violations in ${theme} mode`, async ({
      as,
    }) => {
      const page = await as('owner')
      if (theme === 'dark')
        await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      await openTeam(page)
      await page
        .getByRole('button', { name: /Grace Umeh/ })
        .first()
        .click()
      await expect(page.getByRole('dialog', { name: 'Grace Umeh' })).toBeVisible()

      await expectNoSeriousViolations(page)
    })
  })
}
