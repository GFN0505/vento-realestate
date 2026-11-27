import { expect, type Page, test as plain } from '@playwright/test'
import { createTeamFixture, setRole } from '../support/fixtures'
import { isMobile, sharedTeam, test } from '../support/shell'
import { HOME_GREETING, signInAs } from '../support/sign-in'

// J-ONB-05 steps 1 and 2, decision 12: a module the role can't view appears nowhere in the
// navigation, search or Home, and only a typed link reaches its 403.

const EVERYTHING = [
  'Land & title',
  'Projects',
  'Estates',
  'Sales',
  'Finance',
  'HR & payroll',
  'Compliance',
  'Documents',
  'Reports',
  'Settings',
  'Help',
] as const
type Label = (typeof EVERYTHING)[number]

// Settings and Help are footer entries that appear only once they have somewhere to go, so no
// test requires them; they must never appear for a role that can't have them.
const FOOTER: readonly Label[] = ['Settings', 'Help']
const MODULES = EVERYTHING.filter((label) => !FOOTER.includes(label))

// Written out by hand from the spec's role table, not derived from the app's own registry.
// `approves`: the role holds Approve somewhere, so Approvals (a queue across modules, brick 4)
// follows Home. Owners and admins get it as a phone tab, in place of their third module tab; for
// the others it is the first entry in More.
type Tab = Label | 'Approvals'
const ROLES: Record<
  string,
  { visible: readonly Label[]; tabs: readonly Tab[]; approves: boolean }
> = {
  owner: { visible: EVERYTHING, tabs: ['Approvals', 'Projects', 'Reports'], approves: true },
  finance: {
    visible: [
      'Land & title',
      'Projects',
      'Estates',
      'Sales',
      'Finance',
      'HR & payroll',
      'Compliance',
      'Documents',
      'Reports',
      'Help',
    ],
    tabs: ['Finance', 'Sales', 'Reports'],
    approves: true,
  },
  sales: {
    visible: ['Land & title', 'Projects', 'Sales', 'Compliance', 'Documents', 'Help'],
    tabs: ['Sales', 'Documents', 'Compliance'],
    approves: false,
  },
  facility: {
    visible: ['Projects', 'Estates', 'Sales', 'Documents', 'Help'],
    tabs: ['Estates', 'Projects', 'Documents'],
    approves: true,
  },
  hr: {
    visible: ['HR & payroll', 'Documents', 'Help'],
    tabs: ['HR & payroll', 'Documents'],
    approves: true,
  },
}

const URL_OF: Record<Label, string> = {
  'Land & title': '/land',
  Projects: '/projects',
  Estates: '/estates',
  Sales: '/sales',
  Finance: '/finance',
  'HR & payroll': '/hr',
  Compliance: '/compliance',
  Documents: '/documents',
  Reports: '/reports',
  Settings: '/settings',
  Help: '/help',
}

/** A word only that module's search keywords contain. */
const KEYWORD_OF: Partial<Record<Label, string>> = {
  'Land & title': 'parcels',
  Estates: 'maintenance',
  Finance: 'receipts',
  'HR & payroll': 'payroll',
  Compliance: 'kyc',
  Reports: 'dashboards',
  Settings: 'permissions',
}

const stripSoon = (text: string) => text.replace(/Soon$/, '').trim()
const withoutFooter = (names: string[]) => names.filter((n) => !FOOTER.includes(n as Label))
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')
const startsWith = (text: string) => new RegExp(`^${escapeRegExp(text)}`)

async function openPalette(page: Page) {
  await page.getByRole('button', { name: /Search or run a command/ }).click()
  await expect(page.getByRole('dialog', { name: 'Search or run a command' })).toBeVisible()
}

async function openMore(page: Page) {
  await page.getByRole('navigation', { name: 'Tabs' }).getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await expect(sheet).toBeVisible()
  return sheet
}

for (const [role, { visible, tabs, approves }] of Object.entries(ROLES)) {
  const modules = visible.filter((label) => !FOOTER.includes(label))
  // Modules the role can't view: a typed link to one is a 403. Forbidden adds Settings.
  const hidden = MODULES.filter((label) => !visible.includes(label))
  const forbidden = EVERYTHING.filter((label) => !visible.includes(label) && label !== 'Help')

  test.describe(`as ${role}`, () => {
    test(`${role} sees only permitted modules in the sidebar, tabs and More`, async ({
      as,
    }, testInfo) => {
      const page = await as(role)
      await page.goto('/')

      if (isMobile(testInfo)) {
        const tabLinks = page.getByRole('navigation', { name: 'Tabs' }).getByRole('link')
        await expect(tabLinks).toHaveText(['Home', ...tabs])
        const sheet = await openMore(page)
        const approvalsInMore = approves && !tabs.includes('Approvals') ? ['Approvals'] : []
        const inMore = [...approvalsInMore, ...modules.filter((label) => !tabs.includes(label))]
        const links = sheet.getByRole('region', { name: 'Modules' }).getByRole('link')
        await expect
          .poll(async () => withoutFooter((await links.allTextContents()).map(stripSoon)))
          .toEqual(inMore)
        for (const label of forbidden) {
          await expect(links.filter({ hasText: startsWith(label) })).toHaveCount(0)
        }
      } else {
        const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link')
        // "Sales, coming soon" is the link's accessible text; strip it back to the label.
        await expect
          .poll(async () =>
            withoutFooter(
              (await links.allTextContents()).map((t) => t.replace(/, coming soon.*$/, '')),
            ),
          )
          .toEqual(['Home', ...(approves ? ['Approvals'] : []), ...modules])
        for (const label of forbidden) {
          await expect(links.filter({ hasText: startsWith(label) })).toHaveCount(0)
        }
      }
    })

    test(`${role} never sees a forbidden module in search or on Home`, async ({ as }, testInfo) => {
      const page = await as(role)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
      if (isMobile(testInfo)) {
        // On a phone Home lists the modules; on desktop the sidebar does.
        const cards = page.getByRole('region', { name: 'Your workspace' }).getByRole('link')
        await expect.poll(async () => cards.count()).toBe(modules.length)
        for (const label of forbidden) await expect(cards.filter({ hasText: label })).toHaveCount(0)
      }

      await openPalette(page)
      const goTo = page.getByRole('option', { name: /^Go to / })
      await expect(goTo.first()).toBeVisible()
      for (const label of modules) {
        await expect(goTo.filter({ hasText: startsWith(`Go to ${label}`) })).toHaveCount(1)
      }
      for (const label of forbidden) {
        await expect(goTo.filter({ hasText: startsWith(`Go to ${label}`) })).toHaveCount(0)
      }
      const word = hidden.map((l) => KEYWORD_OF[l]).find((w) => w !== undefined)
      if (word) {
        await page.getByPlaceholder('Type a page or action').fill(word)
        await expect(page.getByText(`No pages or actions match "${word}".`)).toBeVisible()
      }
    })

    // Owners and finance can view every module, so there is no 403 to reach.
    if (hidden.length > 0) {
      test(`${role} typing a forbidden module's address shows the 403 naming who to ask`, async ({
        as,
      }) => {
        const team = await sharedTeam()
        const page = await as(role)
        for (const label of hidden) {
          await page.goto(URL_OF[label])
          await expect(
            page.getByRole('heading', { name: `You don't have access to ${label}` }),
          ).toBeVisible()
          await expect(page.getByText(`Ask ${team.members.owner?.name} (owner)`)).toBeVisible()
          await expect(page.getByRole('link', { name: 'Go to your home' })).toBeVisible()
        }
      })
    }
  })
}

test('a 403 requests no data from the module it refuses', async ({ as }) => {
  const page = await as('sales')
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const procedures: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/rpc/')) procedures.push(path.slice('/rpc/'.length))
  })

  await page.goto('/hr')
  await expect(
    page.getByRole('heading', { name: "You don't have access to HR & payroll" }),
  ).toBeVisible()

  // Repeats (the entity list loads twice) don't matter; only which procedures were called does.
  expect([...new Set(procedures)].sort()).toEqual([
    'access/whoCanChangeAccess',
    'account/me',
    'entities/list',
  ])
})

test('a permitted module that is not built yet opens its Coming soon page', async ({
  as,
}, testInfo) => {
  const page = await as('owner')
  await page.goto('/')

  if (isMobile(testInfo)) {
    // Owners' third tab is Approvals now, so Sales is in More.
    const sheet = await openMore(page)
    await sheet.getByRole('link', { name: /^Sales/ }).click()
  } else {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /^Sales/ })
      .click()
  }

  await expect(page).toHaveURL(/\/sales$/)
  await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible()
  await expect(page.getByText('Coming soon', { exact: true })).toBeVisible()
  await expect(page.getByText('Sell off-plan: leads, units, subscriptions')).toBeVisible()
  await expect(page).toHaveTitle(/^Sales · Vento Homes /)
})

test('an unknown address shows the 404 inside the shell', async ({ as }, testInfo) => {
  const page = await as('sales')
  await page.goto('/no-such-page')

  await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible()
  const shell = isMobile(testInfo) ? 'Tabs' : 'Main'
  await expect(page.getByRole('navigation', { name: shell })).toBeVisible()
})

test('the entity filter survives navigation, back, forward and a pasted link', async ({
  as,
}, testInfo) => {
  const team = await sharedTeam()
  const { id, name } = team.entities.parkview
  const page = await as('owner')
  await page.goto(`/?entity=${id}`)
  await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(name)) })).toBeVisible()

  if (isMobile(testInfo)) {
    // Owners' third tab is Approvals now, so Sales is in More.
    const sheet = await openMore(page)
    await sheet.getByRole('link', { name: /^Sales/ }).click()
  } else {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /^Sales/ })
      .click()
  }
  await expect(page).toHaveURL(new RegExp(`/sales\\?entity=${id}$`))

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/\\?entity=${id}$`))
  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`/sales\\?entity=${id}$`))

  await page.goto(`/documents?entity=${id}`)
  await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(name)) })).toBeVisible()
})

// Watch for: role changed mid-session. A team of its own, because the role really changes. The
// member starts as Facility (two-step on, which Facility requires since it approves) and becomes
// Sales, which needs none: moving the other way would stop at the two-step setup page instead.
plain(
  'a role changed while a page is open updates the navigation and turns the page into a 403',
  async ({ page }, testInfo) => {
    const team = await createTeamFixture()
    const facility = team.members.facility
    if (!facility) throw new Error('No facility member')
    await signInAs(page, facility, team.password)
    await page.goto('/estates')
    await expect(page.getByRole('heading', { name: 'Estates' })).toBeVisible()

    setRole(facility.email, 'sales')
    // Coming back to the tab rechecks who you are.
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
    )

    await expect(
      page.getByRole('heading', { name: "You don't have access to Estates" }),
    ).toBeVisible()
    const shell = isMobile(testInfo) ? 'Tabs' : 'Main'
    const nav = page.getByRole('navigation', { name: shell })
    if (!isMobile(testInfo)) {
      await expect(nav.getByRole('link', { name: /^Estates/ })).toHaveCount(0)
      await expect(nav.getByRole('link', { name: /^Compliance/ })).toBeVisible()
    }
  },
)
