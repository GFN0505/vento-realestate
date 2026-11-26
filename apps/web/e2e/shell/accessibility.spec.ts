import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { test } from '../support/shell'
import { HOME_GREETING } from '../support/sign-in'

// Serious and critical axe violations fail the build, on each shell screen in both themes.
// (375 px is the phone project; the desktop project covers 1280 px.)

async function settle(page: Page) {
  // Colours are checked mid-fade otherwise.
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

const SCREENS: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'Home',
    open: async (page) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    },
  },
  {
    name: 'the 403 page',
    open: async (page) => {
      await page.goto('/finance')
      await expect(
        page.getByRole('heading', { name: "You don't have access to Finance" }),
      ).toBeVisible()
      await expect(page.getByText(/Ask Olumide Bankole/)).toBeVisible()
    },
  },
  {
    name: 'a Coming soon page',
    open: async (page) => {
      await page.goto('/sales')
      await expect(page.getByText('Coming soon', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'the 404 page',
    open: async (page) => {
      await page.goto('/no-such-page')
      await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    },
  },
  {
    name: 'the command palette',
    open: async (page) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
      await page.getByRole('button', { name: /Search or run a command/ }).click()
      await expect(page.getByRole('option', { name: /^Go to Home/ })).toBeVisible()
    },
  },
]

for (const theme of ['light', 'dark'] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} has no serious accessibility violations in ${theme} mode`, async ({
      as,
    }) => {
      const page = await as('sales')
      if (theme === 'dark') {
        await page.addInitScript(() => localStorage.setItem('vento-theme', 'dark'))
      }
      await screen.open(page)
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)

      await expectNoSeriousViolations(page)
    })
  }
}
