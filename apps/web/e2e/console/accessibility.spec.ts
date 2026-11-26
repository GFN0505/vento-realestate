import { expect, type Page, test } from '@playwright/test'
import {
  expectNoSeriousViolations,
  openOrganization,
  signInToConsole,
  useTheme,
} from '../support/console'
import { createStarterOrgFixture, createSuperAdminFixture } from '../support/fixtures'

// Every console screen, with axe (serious and critical fail) in light and dark, and again at
// 375 px wide with a check that nothing scrolls sideways.

type Org = { organizationName: string; organizationId: string }
type Screen = { name: string; open: (page: Page, org: Org) => Promise<void> }

const heading = (page: Page, name: string | RegExp) =>
  expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()

const SCREENS: Screen[] = [
  {
    name: 'Organizations',
    open: async (page) => {
      await page.goto('/console')
      await heading(page, 'Organizations')
      await expect(page.getByRole('searchbox', { name: /Search by organization/ })).toBeVisible()
      await expect(
        page.getByRole('link', { name: /Lekki Partners|Vento Homes/ }).first(),
      ).toBeVisible()
    },
  },
  {
    name: 'Organization detail',
    open: async (page, org) => {
      await page.goto('/console')
      await openOrganization(page, org)
      await expect(page.getByTestId('feature-why').first()).toBeVisible()
    },
  },
  {
    name: 'Change plan review step',
    open: async (page, org) => {
      await page.goto('/console')
      await openOrganization(page, org)
      await page.getByRole('button', { name: 'Change plan' }).click()
      await page
        .getByRole('dialog')
        .getByRole('radio', { name: /Growth/ })
        .click()
      await page.getByRole('dialog').getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('dialog').getByLabel('Reason')).toBeVisible()
    },
  },
  {
    name: 'Releases',
    open: async (page) => {
      await page.goto('/console/releases')
      await heading(page, 'Releases')
      await expect(page.getByRole('link', { name: /^Board pack/ }).first()).toBeVisible()
    },
  },
  {
    name: 'Plans',
    open: async (page) => {
      await page.goto('/console/plans')
      await heading(page, 'Plans')
      await expect(page.getByTestId('plan-row').first()).toBeVisible()
    },
  },
  {
    name: 'Publish sheet',
    open: async (page) => {
      await page.goto('/console/plans/growth')
      await page.getByRole('button', { name: /^Publish v\d+$/ }).click()
      await expect(page.getByRole('dialog').getByLabel('People', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'Activity',
    open: async (page) => {
      await page.goto('/console/activity')
      await heading(page, 'Activity')
      await expect(page.getByLabel('Person')).toBeVisible()
    },
  },
  {
    name: 'Super-admins',
    open: async (page) => {
      await page.goto('/console/super-admins')
      await heading(page, 'Super-admins')
      await expect(page.getByTestId('super-admin-row').first()).toBeVisible()
    },
  },
  {
    name: 'Add super-admin sheet',
    open: async (page) => {
      await page.goto('/console/super-admins')
      await page.getByRole('button', { name: 'Add super-admin' }).click()
      await expect(page.getByRole('dialog').getByLabel('Email')).toBeVisible()
    },
  },
]

// KNOWN APP BUGS (reported, not fixed here). Each is marked test.fail so the suite stays green
// and starts failing, loudly, the day it is fixed: remove the entry then.
const KNOWN: Record<string, string> = {
  'light:Organizations':
    'Selected stat tile (bg-selected/40) has small text that fails color-contrast in light mode',
  'width:Releases':
    'The Stage chips (a fieldset with -mx-4 overflow-x-auto) push the page 23 px wider than 375 px',
  'phone-axe:Organizations':
    'Selected stat tile (bg-selected/40) has small text that fails color-contrast in light mode',
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} mode`, () => {
    for (const screen of SCREENS) {
      test(`${screen.name} has no serious accessibility violations in ${theme} mode`, async ({
        page,
      }) => {
        const known = KNOWN[`${theme}:${screen.name}`]
        test.fail(Boolean(known), known ?? '')
        const org = createStarterOrgFixture()
        await useTheme(page, theme)
        await signInToConsole(page, createSuperAdminFixture('member'))
        await screen.open(page, org)
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)

        await expectNoSeriousViolations(page)
      })
    }
  })
}

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const screen of SCREENS) {
    test(`${screen.name} does not scroll sideways at 375 px`, async ({ page }) => {
      const known = KNOWN[`width:${screen.name}`]
      test.fail(Boolean(known), known ?? '')
      const org = createStarterOrgFixture()
      await signInToConsole(page, createSuperAdminFixture('member'))
      await screen.open(page, org)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(overflow).toBeLessThanOrEqual(0)
    })

    test(`${screen.name} has no serious accessibility violations at 375 px`, async ({ page }) => {
      const known = KNOWN[`phone-axe:${screen.name}`]
      test.fail(Boolean(known), known ?? '')
      const org = createStarterOrgFixture()
      await signInToConsole(page, createSuperAdminFixture('member'))
      await screen.open(page, org)

      await expectNoSeriousViolations(page)
    })
  }
})
