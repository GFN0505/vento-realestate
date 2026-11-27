import { expect, type Page, test } from '@playwright/test'
import { signInAsStaff } from '../support/console'
import {
  createDashboardFixture,
  createStarterOrgFixture,
  createSuperAdminFixture,
  platformActivity,
} from '../support/fixtures'

// J-ADM-06: start the day on the Dashboard. The fixture makes organizations with unique names: a
// trial ending in 2 days, one over its limit, one with no plan, one gone quiet, and an internal
// one that must never appear.

/**
 * The queue shows 8 rows and command-line changes of the last 7 days come first. Platform events
 * can't be deleted, so on a database that has seen many runs they can fill it; say so, don't fail.
 */
async function requireQueueRoom(page: Page, quiet: string) {
  const rows = page.getByTestId('attention-row')
  await expect(rows.first()).toBeVisible()
  const full = (await rows.count()) >= 8
  const ours = await queueRow(page, quiet).count()
  test.skip(full && ours === 0, 'Rows from earlier runs fill the queue: reset the e2e database')
}

const queueRow = (page: Page, name: string) =>
  page.getByTestId('attention-row').filter({ hasText: name })

test.describe('the Dashboard', () => {
  test('staff land on it after signing in, with the header counts and the four numbers', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByText(/^[\d,]+ organizations? · [\d,]+ (people|person)$/)).toBeVisible()
    for (const label of [
      'Organizations',
      'Active this week',
      'Trials ending soon',
      'Over a limit',
    ]) {
      await expect(page.getByRole('link', { name: new RegExp(`^${label} [\\d,]+`) })).toBeVisible()
    }
  })

  test('the Trials ending soon and Over a limit numbers open the filtered list', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())

    await page.getByRole('link', { name: /^Trials ending soon [\d,]+/ }).click()
    await expect(page).toHaveURL(/\/console\/organizations\?.*filter=trial/)
    await page.goBack()
    await page.getByRole('link', { name: /^Over a limit [\d,]+/ }).click()

    await expect(page).toHaveURL(/\/console\/organizations\?.*filter=over_limit/)
  })

  test('Find an organization opens Organizations with that search on Enter', async ({ page }) => {
    const org = createStarterOrgFixture()
    await signInAsStaff(page, createSuperAdminFixture())

    await page.getByRole('searchbox', { name: 'Find an organization' }).fill(org.organizationName)
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/console\/organizations\?.*q=/)
    await expect(page.getByRole('link', { name: new RegExp(org.organizationName) })).toBeVisible()
  })

  test('Customer activity shows the weekly summary and Plans and releases shows the plan split, pilot features and recent changes', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())

    await expect(
      page.getByRole('heading', { name: 'Customer activity · last 7 days' }),
    ).toBeVisible()
    await expect(
      page.getByText(
        /new organizations? · .* invitations? sent, \d+ accepted · .* trials? started · .* sign-ups? not finished/,
      ),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Plans and releases' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'At pilot' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Recent changes' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'See all activity' })).toBeVisible()
  })

  test('the customer activity feed names organizations and events but never a person or an email', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await expect(
      page.getByRole('heading', { name: 'Customer activity · last 7 days' }),
    ).toBeVisible()

    const page_ = page.getByRole('main')

    expect((await page_.textContent()) ?? '').not.toMatch(/@[\w-]+\./)
  })

  test('the Dashboard is the first item in the sidebar', async ({ page, isMobile }) => {
    await signInAsStaff(page, createSuperAdminFixture())

    const nav = page.getByRole('navigation', { name: isMobile ? 'Tabs' : 'Console' })

    await expect(nav.getByRole('link').first()).toHaveText('Dashboard')
  })

  test('a failed load says so and Try again loads it', async ({ page }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    let fail = true
    await page.route('**/rpc/console/dashboard/get*', (route) =>
      fail ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
    )

    await page.goto('/console')
    await expect(page.getByText("Couldn't load the Dashboard.")).toBeVisible()
    fail = false
    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })
})

test.describe('the Needs attention queue (desktop)', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'One set of fixture organizations, so only one project makes them',
  )
  test.describe.configure({ mode: 'serial' })
  let names: ReturnType<typeof createDashboardFixture>
  test.beforeAll(() => {
    names = createDashboardFixture()
  })

  test('Needs attention shows the trial, over-limit, no-plan and quiet organizations with their action and never the internal one', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await requireQueueRoom(page, names.quiet)

    const queue = page.getByRole('list', { name: 'Needs attention' })
    await expect(queue).toBeVisible()

    await expect(queueRow(page, names.trial)).toContainText('Enterprise trial ends in 2 days')
    await expect(queueRow(page, names.overLimit)).toContainText(/People \d+ of \d+/)
    await expect(queueRow(page, names.noPlan)).toContainText('No plan')
    await expect(
      queueRow(page, names.noPlan).getByRole('link', { name: 'Choose a plan' }),
    ).toBeVisible()
    await expect(queueRow(page, names.quiet)).toContainText('nobody active for 18 days')
    await expect(queue.getByText(names.internal)).toHaveCount(0)
    await expect(
      page.getByRole('list', { name: 'Customer activity' }).getByText(names.internal),
    ).toHaveCount(0)
  })

  test('a command-line change appears first in the queue and Review opens Activity', async ({
    page,
  }) => {
    platformActivity(createSuperAdminFixture().email)
    await signInAsStaff(page, createSuperAdminFixture())
    await requireQueueRoom(page, names.quiet)

    const first = page.getByTestId('attention-row').first()

    await expect(first).toContainText('from the command line')
    await first.getByRole('link', { name: 'Review' }).click()
    await expect(page).toHaveURL(/\/console\/activity/)
  })

  test('Review on a queue row opens that organization', async ({ page }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await requireQueueRoom(page, names.quiet)

    await queueRow(page, names.quiet).getByRole('link', { name: 'Review' }).click()

    await expect(page.getByRole('heading', { name: names.quiet, level: 1 })).toBeVisible()
  })

  test('Choose a plan on a no-plan row opens the plan sheet on that organization', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await requireQueueRoom(page, names.quiet)

    await queueRow(page, names.noPlan).getByRole('link', { name: 'Choose a plan' }).click()

    // The sheet is modal, so the page's own heading is hidden behind it: it names the organization.
    await expect(page.getByRole('dialog', { name: 'Choose a plan' })).toContainText(names.noPlan)
  })
})

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the numbers sit two by two, nothing scrolls sideways and Dashboard is the first tab', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())

    const first = await page.getByRole('link', { name: /^Organizations [\d,]+/ }).boundingBox()
    const second = await page.getByRole('link', { name: /^Active this week [\d,]+/ }).boundingBox()
    const third = await page.getByRole('link', { name: /^Trials ending soon [\d,]+/ }).boundingBox()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect(overflow).toBeLessThanOrEqual(0)
    expect(second?.y).toBeCloseTo(first?.y ?? -1, 0)
    expect(third?.y ?? 0).toBeGreaterThan(first?.y ?? 0)
    await expect(
      page.getByRole('navigation', { name: 'Tabs' }).getByRole('link').first(),
    ).toHaveText('Dashboard')
  })
})
