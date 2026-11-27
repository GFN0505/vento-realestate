import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
import { nextTotpCode, totpCode } from './totp'

export const STAFF_LABEL = 'Vento Real Estate staff · all customers'

/** Signs in with a code (which counts as fresh proof) and opens the console without a prompt. */
export async function signInToConsole(
  page: Page,
  admin: { email: string; password: string; totpSecret: string },
  path = '/console',
) {
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(admin.email)
  await page.getByLabel('Password', { exact: true }).fill(admin.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(totpCode(admin.totpSecret))
  // A person with an organization lands on Home; one without lands on the console.
  await expect(page).toHaveURL(/\/(console|$)/)
  await page.goto(path)
  await expect(page.getByText(STAFF_LABEL).locator('visible=true').first()).toBeVisible()
}

/**
 * Staff sign in on the normal sign-in page and land on the console Dashboard: the code just typed
 * is fresh proof, so no "Confirm it's you" (admin-console plan §1b.6).
 */
export async function signInAsStaff(
  page: Page,
  admin: { email: string; password: string; totpSecret: string },
) {
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(admin.email)
  await page.getByLabel('Password', { exact: true }).fill(admin.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(totpCode(admin.totpSecret))
  await expect(page).toHaveURL(/\/console\/?$/)
}

/** Opens a staff invitation link (from the fixture or the mailbox) on this web origin. */
export async function openStaffInvitation(page: Page, link: string) {
  const url = new URL(link)
  await page.goto(`${url.pathname}${url.search}`)
}

/** Fills the "Confirm it's you" form (page card or dialog) with an authenticator code. */
export async function confirmWithCode(page: Page | Locator, secret: string) {
  // The signing-in code was used in this 30-second window; the next window's code is accepted.
  await page.getByLabel('6-digit code').fill(nextTotpCode(secret))
}

export async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
}

export async function expectNoSeriousViolations(page: Page) {
  await settle(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([])
}

export async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => localStorage.setItem('vento-theme', value), theme)
}

/** The shell's navigation, the sidebar on desktop or the tab bar on a phone. */
export const consoleNav = (page: Page) =>
  page.getByRole('navigation').filter({ has: page.getByRole('link', { name: 'Releases' }) })

/** Opens a section by its sidebar or tab link; phones keep Activity and Super-admins under More. */
export async function goToSection(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true }).locator('visible=true').first()
  if (await link.isVisible()) return link.click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name }).click()
}

/** The "Confirm it's you" dialog that opens over the page mid-task. */
export const proofDialog = (page: Page) => page.getByRole('dialog', { name: "Confirm it's you" })

/**
 * Searches the Organizations list for the name and opens that organization's detail page. Fixture
 * names can repeat when two are made in the same millisecond, so the link is picked by id.
 */
export async function openOrganization(
  page: Page,
  org: { organizationName: string; organizationId: string },
) {
  const { organizationName: name, organizationId: id } = org
  const search = page.getByRole('searchbox', { name: /Search by organization/ })
  await expect(search).toBeVisible()
  await expect(page.getByRole('link', { name: /\S/ }).first()).toBeVisible()
  await search.fill(name)
  const link = page.locator(`a[href$="/console/organizations/${id}"]`)
  await expect(link).toHaveCount(1, { timeout: 20_000 })
  await expect(async () => {
    await link.click({ timeout: 3_000 })
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
}
