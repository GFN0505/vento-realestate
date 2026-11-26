import { expect, type Page } from '@playwright/test'
import { test } from '../support/shell'
import { HOME_GREETING } from '../support/sign-in'

// J-ONB-05 steps 5 and 6. The user menu lives in the sidebar, so these are desktop tests.
test.skip(({ isMobile }) => isMobile, 'The user menu is in the sidebar on desktop')

async function openUserMenu(page: Page) {
  await page.getByRole('button', { name: /^Account: / }).click()
}

async function chooseTheme(page: Page, name: 'Light' | 'Dark' | 'System') {
  await openUserMenu(page)
  await page.getByRole('menuitemradio', { name }).click()
}

/** Records the <html> class when the document is parsed, before the app has rendered anything. */
async function recordFirstClass(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      ;(window as unknown as { firstClass: string }).firstClass = document.documentElement.className
    })
  })
}
const firstClass = (page: Page) =>
  page.evaluate(() => (window as unknown as { firstClass: string }).firstClass)

test('the first visit is light', async ({ as }) => {
  const page = await as('owner')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('Dark persists over a reload and is already applied before the app renders', async ({
  as,
}) => {
  const page = await as('owner')
  await recordFirstClass(page)
  await page.goto('/')

  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()

  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  expect(await firstClass(page)).toMatch(/dark/)
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('choosing Light again removes the dark theme for good', async ({ as }) => {
  const page = await as('owner')
  await recordFirstClass(page)
  await page.goto('/')
  await chooseTheme(page, 'Dark')

  await chooseTheme(page, 'Light')
  await page.reload()

  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  expect(await firstClass(page)).not.toMatch(/dark/)
})

test('System follows the device, now and when it changes', async ({ as }) => {
  const page = await as('owner')
  await page.emulateMedia({ colorScheme: 'dark' })
  await recordFirstClass(page)
  await page.goto('/')
  await chooseTheme(page, 'System')
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  expect(await firstClass(page)).toMatch(/dark/)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('previewing Sales shows the banner and Sales navigation, survives a reload, and stops', async ({
  as,
}) => {
  const page = await as('owner')
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: /^Finance/ })).toBeVisible()

  await openUserMenu(page)
  await page.getByRole('menuitem', { name: 'Preview as role' }).click()
  await page.getByRole('menuitemradio', { name: 'Sales' }).click()

  const banner = page.getByRole('status').filter({ hasText: 'Previewing as Sales.' })
  await expect(banner).toBeVisible()
  await expect(nav.getByRole('link', { name: /^Finance/ })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: /^Sales/ })).toBeVisible()

  await page.reload()
  await expect(banner).toBeVisible()
  await expect(nav.getByRole('link', { name: /^Finance/ })).toHaveCount(0)

  await banner.getByRole('button', { name: 'Stop preview' }).click()
  await expect(banner).toHaveCount(0)
  await expect(nav.getByRole('link', { name: /^Finance/ })).toBeVisible()
})

test('while previewing, a module the previewed role cannot view opens the 403', async ({ as }) => {
  const page = await as('owner')
  await page.goto('/')
  await openUserMenu(page)
  await page.getByRole('menuitem', { name: 'Preview as role' }).click()
  await page.getByRole('menuitemradio', { name: 'Facility' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Previewing as Facility.' }),
  ).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: /^Estates/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Estates' })).toBeVisible()
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await page.goto('/finance')

  await expect(
    page.getByRole('heading', { name: "You don't have access to Finance" }),
  ).toBeVisible()
  await expect(page.getByText('(previewing as Facility)')).toBeVisible()
})

test('a preview ends in a new tab and is not offered to people who are not owners or admins', async ({
  as,
}) => {
  const owner = await as('owner')
  await owner.goto('/')
  await openUserMenu(owner)
  await owner.getByRole('menuitem', { name: 'Preview as role' }).click()
  await owner.getByRole('menuitemradio', { name: 'Sales' }).click()
  await expect(owner.getByRole('status').filter({ hasText: 'Previewing as Sales.' })).toBeVisible()

  const newTab = await owner.context().newPage()
  await newTab.goto('/')
  await expect(newTab.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  await expect(newTab.getByRole('status').filter({ hasText: 'Previewing as' })).toHaveCount(0)

  const sales = await as('sales')
  await sales.goto('/')
  await openUserMenu(sales)
  await expect(sales.getByRole('menuitemradio', { name: 'Dark' })).toBeVisible()
  await expect(sales.getByRole('menuitem', { name: 'Preview as role' })).toHaveCount(0)
})
