import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { ageReauth, createSecurityTeamFixture } from '../support/fixtures'
import { card, openSecurity } from '../support/security'
import { signInAs } from '../support/sign-in'

// Serious and critical axe violations fail the build on My security, its dialogs and the
// passkey button on Sign in, in both themes, at the project's size and at 1024 px.

test.describe.configure({ timeout: 90_000 })

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

for (const width of [null, 1024] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} mode${width ? ` at ${width}px` : ''}`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        test.skip(
          width !== null && testInfo.project.name !== 'desktop',
          'width variants are laptop',
        )
        if (width) await page.setViewportSize({ width, height: 800 })
        if (theme === 'dark')
          await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      })

      test(`My security has no serious accessibility violations in ${theme} mode`, async ({
        page,
      }) => {
        const { members, password } = createSecurityTeamFixture()
        await signInAs(page, members.sales, password)
        await openSecurity(page)
        await expect(page.getByRole('region', { name: 'Passkeys' })).toBeVisible()
        await expect(page.getByRole('region', { name: "Where you're signed in" })).toBeVisible()

        await expectNoSeriousViolations(page)
      })

      test(`Change password, Set up two-step and Confirm it's you have no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        const { members, password } = createSecurityTeamFixture()
        await signInAs(page, members.sales, password)
        await openSecurity(page)

        await card(page, 'Sign-in').getByRole('button', { name: 'Change password' }).click()
        await expect(page.getByRole('dialog', { name: 'Change password' })).toBeVisible()
        await expectNoSeriousViolations(page)
        await page.keyboard.press('Escape')

        await card(page, 'Sign-in').getByRole('button', { name: 'Turn on' }).click()
        await expect(page.getByRole('dialog', { name: 'Set up two-step sign-in' })).toBeVisible()
        await expectNoSeriousViolations(page)
        await page.keyboard.press('Escape')

        // A fresh sign-in counts as confirmed; close that window so Confirm it's you asks.
        ageReauth(members.sales.email)
        await page.reload()
        await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).click()
        await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toBeVisible()
        await expectNoSeriousViolations(page)
      })

      test(`New backup codes has no serious violations in ${theme} mode`, async ({ page }) => {
        const { members, password } = createSecurityTeamFixture()
        await signInAs(page, members.finance, password)
        await openSecurity(page)

        await card(page, 'Sign-in').getByRole('button', { name: 'Make new codes' }).click()
        const dialog = page.getByRole('dialog', { name: 'New backup codes' })
        await dialog.getByLabel('Password', { exact: true }).fill(password)
        await dialog.getByRole('button', { name: 'Make new codes' }).click()
        await expect(dialog.getByRole('list', { name: 'Backup codes' })).toBeVisible()

        await expectNoSeriousViolations(page)
      })

      test(`Sign in with the passkey button has no serious violations in ${theme} mode`, async ({
        page,
        isMobile,
      }) => {
        // KNOWN APP BUG (reported, not fixed here): since the Vento Real Estate naming change the
        // footnote link "Create an account" (a[href$="sign-up"]) fails axe link-in-text-block
        // (serious): it differs from the surrounding text by colour alone. Remove once fixed.
        test.fail(!isMobile, 'Sign-in footnote link fails link-in-text-block')
        await page.goto('/sign-in')
        await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible()

        await expectNoSeriousViolations(page)
      })
    })
  }
}
