import { expect, type Page, test as plain } from '@playwright/test'
import { sharedTeam, test } from '../support/shell'
import { HOME_GREETING, runCommand, signInWithPassword } from '../support/sign-in'

// J-ONB-05 steps 2 and 7. Keyboard shortcuts are for desktop; phones get the search icon.
test.skip(({ isMobile }) => isMobile, 'Keyboard shortcuts are for desktop')

/** Opens ⌘K and waits for the search field, so typed keys land in it (the palette's code loads on idle). */
async function openPaletteWithKeyboard(page: Page) {
  await page.keyboard.press('ControlOrMeta+K')
  await expect(page.getByPlaceholder('Type a page or action')).toBeFocused()
}

test('⌘K opens the palette and Escape closes it', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await page.keyboard.press('ControlOrMeta+K')
  const palette = page.getByRole('dialog', { name: 'Search or run a command' })
  await expect(palette).toBeVisible()
  await expect(palette.getByPlaceholder('Type a page or action')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})

test('typing "sales go" and pressing Enter opens Sales', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await openPaletteWithKeyboard(page)
  await page.keyboard.type('sales go')
  await expect(page.getByRole('option').first()).toHaveText(/Go to Sales/)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/sales$/)
  await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible()
})

test('a search with no match says so', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await openPaletteWithKeyboard(page)
  await page.keyboard.type('zzzz')

  await expect(page.getByText('No pages or actions match "zzzz".')).toBeVisible()
})

test('? lists the keyboard shortcuts', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await page.keyboard.press('?')

  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  for (const label of [
    'Search or run a command',
    'Show shortcuts',
    'Collapse sidebar',
    'Go to home',
  ]) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible()
  }
})

test('typing ? in a field does not open the shortcuts', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  await openPaletteWithKeyboard(page)

  await page.keyboard.type('what?')

  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden()
  await expect(page.getByPlaceholder('Type a page or action')).toHaveValue('what?')
})

test('g then h goes home from another page', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/sales')
  await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible()

  await page.keyboard.press('g')
  await page.keyboard.press('h')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
})

test('[ collapses the sidebar and the choice survives a reload', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await page.keyboard.press('[')
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed')
  await page.reload()
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed')
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
})

plain('recently opened pages are listed, then cleared after sign-out', async ({ page }) => {
  const team = await sharedTeam()
  const viewer = team.members.viewer
  if (!viewer) throw new Error('No viewer in the team')
  const credentials = { email: viewer.email, password: team.password }
  await signInWithPassword(page, credentials)
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  await page.goto('/documents')
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()

  await page.keyboard.press('ControlOrMeta+K')
  const recent = page.getByRole('group', { name: 'Recently opened' })
  await expect(recent.getByRole('option', { name: 'Projects' })).toBeVisible()
  await page.keyboard.press('Escape')

  await runCommand(page, 'Sign out')
  await expect(page).toHaveURL(/\/sign-in/)
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('vento-recent:')),
    ),
  ).toEqual([])

  await signInWithPassword(page, credentials)
  await page.keyboard.press('ControlOrMeta+K')
  await expect(page.getByRole('option', { name: /^Go to Projects/ })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Recently opened' })).toHaveCount(0)
})
