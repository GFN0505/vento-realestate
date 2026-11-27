import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { createApprovalsTeamFixture } from '../support/fixtures'
import { signInAs } from '../support/sign-in'

// Serious and critical axe violations fail the build on the brick 4 screens (the inbox, Approval
// rules and the Audit log), in both themes, at a phone's 375 px and a laptop's 1280 px.

test.describe.configure({ timeout: 120_000 })

async function expectNoSeriousViolations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([])
}

for (const width of [375, 1280] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} mode at ${width}px`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        // The width is set here, so one project covers both sizes.
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set by the spec')
        await page.setViewportSize({ width, height: width === 375 ? 740 : 800 })
        if (theme === 'dark')
          await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      })

      async function ownerPage(page: Page) {
        const team = createApprovalsTeamFixture(true)
        await signInAs(page, team.owner, team.password)
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
        return team
      }

      test(`The Approvals inbox and an open request have no serious violations in ${theme} mode at ${width}px`, async ({
        page,
      }) => {
        await ownerPage(page)
        await page.goto('/approvals')
        await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible()
        const row = page.getByRole('link', { name: /Site engineer: Sales & CRM edit removed/ })
        await expect(row).toBeVisible()
        await expectNoSeriousViolations(page)

        // Phones open a request as its own page; a laptop already shows it beside the list.
        if (width === 375) await row.click()
        await expect(page.getByRole('button', { name: 'Approve role change' })).toBeVisible()
        await expectNoSeriousViolations(page)
      })

      test(`Approval rules and the Add rule sheet have no serious violations in ${theme} mode at ${width}px`, async ({
        page,
      }) => {
        await ownerPage(page)
        await page.goto('/settings/approval-rules')
        await expect(page.getByRole('heading', { name: 'Approval rules', level: 1 })).toBeVisible()
        await expect(page.getByText("Change a role's permissions").first()).toBeVisible()
        await expectNoSeriousViolations(page)

        await page.getByRole('button', { name: 'Add rule' }).first().click()
        await expect(page.getByRole('dialog', { name: 'Add rule' })).toBeVisible()
        await expectNoSeriousViolations(page)
      })

      test(`The Audit log and an open entry have no serious violations in ${theme} mode at ${width}px`, async ({
        page,
      }) => {
        const team = await ownerPage(page)
        await page.goto(`/settings/audit-log?q=${encodeURIComponent(team.changed.name)}`)
        await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible()
        const entry = page.getByRole('button', { name: new RegExp(team.changed.name) }).first()
        await expect(entry).toBeVisible()
        await expectNoSeriousViolations(page)

        await entry.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectNoSeriousViolations(page)
      })
    })
  }
}
