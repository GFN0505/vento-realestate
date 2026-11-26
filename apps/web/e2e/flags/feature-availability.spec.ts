import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  createStarterOrgFixture,
  createTeamFixture,
  releaseFlags,
  setFeatureOverride,
  setReleaseOverride,
  startTrial,
} from '../support/fixtures'
import { isMobile } from '../support/shell'
import { HOME_GREETING, signInWithPassword, signInWithTotp } from '../support/sign-in'

// J-ADM-01 and J-ADM-02 as the member experiences them (the staff side is the flags CLI, covered
// by API tests), J-ONB-05 step 2 and its watch-for. Every test makes its own organization,
// because each changes that organization's flags.

// Each test makes its own organization through slow fixtures, and the suite runs in parallel.
test.describe.configure({ timeout: 90_000 })

const MODULES = [
  'Land & title',
  'Projects',
  'Estates',
  'Sales',
  'Finance',
  'HR & payroll',
  'Compliance',
  'Documents',
  'Reports',
] as const
const URL_OF: Record<(typeof MODULES)[number], string> = {
  'Land & title': '/land',
  Projects: '/projects',
  Estates: '/estates',
  Sales: '/sales',
  Finance: '/finance',
  'HR & payroll': '/hr',
  Compliance: '/compliance',
  Documents: '/documents',
  Reports: '/reports',
}

// Commissions need Sales, which needs Projects: a hint is only offered for what buying would
// really unlock, so all three must be released to the organization.
const COMMISSIONS_AND_WHAT_IT_NEEDS = ['projects', 'sales', 'sales.commissions'] as const

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')

/**
 * Coming back to the tab refetches who you are and what you have. The API reloads its snapshot
 * every second here (30 seconds at most in production), so a change shows on a later refetch:
 * repeat the return until `check` holds.
 */
async function returnToTabUntil(page: Page, check: () => Promise<void>) {
  await expect(async () => {
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
    )
    await check()
  }).toPass({ timeout: 15_000 })
}

async function openPalette(page: Page) {
  await page.getByRole('button', { name: /Search or run a command/ }).click()
  await expect(page.getByRole('dialog', { name: 'Search or run a command' })).toBeVisible()
}

async function closePalette(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Search or run a command' })).toBeHidden()
}

/** Opens search, runs `check` against it and always closes it, so a retry starts clean. */
async function inPalette(page: Page, check: () => Promise<void>) {
  await openPalette(page)
  try {
    await check()
  } finally {
    await closePalette(page)
  }
}

/** No link to any of `labels` inside `scope`. */
async function expectNoModules(scope: Page | Locator, labels: readonly string[]) {
  for (const label of labels) {
    await expect(
      scope.getByRole('link', { name: new RegExp(`^${escapeRegExp(label)}`) }),
    ).toHaveCount(0)
  }
}

/** `owner`: Settings is core (every plan), so an owner keeps it in the sidebar footer. */
async function expectNoModulesAnywhere(page: Page, mobile: boolean, owner = false) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  const shell = page.getByRole('navigation', { name: mobile ? 'Tabs' : 'Main' })
  await expect(shell.getByRole('link')).toHaveText(
    owner && !mobile ? ['Home', 'Settings'] : ['Home'],
  )
  await expectNoModules(page, MODULES)
  if (mobile) {
    await shell.getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet).toBeVisible()
    await expectNoModules(sheet, MODULES)
    await page.keyboard.press('Escape')
  }
  await openPalette(page)
  await expect(
    page.getByRole('option', {
      name: /^Go to (?!Home|Settings|Team|Organization|Companies|Roles)/,
    }),
  ).toHaveCount(0)
  await page.getByPlaceholder('Type a page or action').fill('parcels')
  await expect(page.getByText('No pages or actions match "parcels".')).toBeVisible()
  await closePalette(page)
}

/** Sign-in details for a fixture person who has two-step on. */
function totpCredentials(person: { email: string; totpSecret?: string }, password: string) {
  if (!person.totpSecret) throw new Error(`No two-step secret for ${person.email}`)
  return { email: person.email, password, totpSecret: person.totpSecret }
}

test.describe('a standard organization on Starter', () => {
  test('sees no unreleased module in the sidebar, tabs, More, search or Home', async ({
    page,
  }, testInfo) => {
    const org = createStarterOrgFixture()
    await signInWithTotp(page, totpCredentials(org.owner, org.password))

    await expectNoModulesAnywhere(page, isMobile(testInfo), true)
  })

  test('shows Not found, not a 403, for a typed link to an unreleased module', async ({ page }) => {
    const org = createStarterOrgFixture()
    await signInWithPassword(page, { email: org.sales.email, password: org.password })

    for (const label of MODULES) {
      await page.goto(URL_OF[label])
      await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
      await expect(page.getByText("You don't have access")).toHaveCount(0)
    }
  })

  test('still shows nothing for a module released to it that is not built yet', async ({
    page,
  }, testInfo) => {
    const org = createStarterOrgFixture()
    setReleaseOverride(org.organizationId, 'land', 'on')
    await signInWithPassword(page, { email: org.sales.email, password: org.password })

    await expectNoModulesAnywhere(page, isMobile(testInfo))
    await page.goto('/land')
    await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
  })
})

test.describe('an internal organization', () => {
  test('sees unbuilt modules quietly, tagged Soon, with the Coming soon page', async ({
    page,
  }, testInfo) => {
    const team = createTeamFixture()
    const owner = team.members.owner
    if (!owner) throw new Error('No owner in the team')
    await signInWithTotp(page, totpCredentials(owner, team.password))

    await page.goto('/land')

    await expect(page.getByRole('heading', { name: 'Land & title' })).toBeVisible()
    await expect(page.getByText('Coming soon', { exact: true })).toBeVisible()
    await expect(page.getByText("isn't available on your account")).toHaveCount(0)
    if (!isMobile(testInfo)) {
      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav.getByRole('link', { name: /^Land & title/ })).toContainText('Soon')
    }
  })

  test('loses a module when a release override switches it off, and gets it back when cleared', async ({
    page,
  }) => {
    const team = createTeamFixture()
    const owner = team.members.owner
    if (!owner) throw new Error('No owner in the team')
    await signInWithTotp(page, totpCredentials(owner, team.password))
    await openPalette(page)
    await expect(page.getByRole('option', { name: /^Go to Land & title/ })).toBeVisible()
    await closePalette(page)

    setReleaseOverride(team.organizationId, 'land', 'off')
    await returnToTabUntil(page, () =>
      inPalette(page, async () => {
        await expect(page.getByRole('option', { name: /^Go to Estates/ })).toBeVisible()
        await expect(page.getByRole('option', { name: /^Go to Land & title/ })).toHaveCount(0, {
          timeout: 500,
        })
      }),
    )

    setReleaseOverride(team.organizationId, 'land', 'clear')
    await returnToTabUntil(page, () =>
      inPalette(page, () =>
        expect(page.getByRole('option', { name: /^Go to Land & title/ })).toBeVisible({
          timeout: 500,
        }),
      ),
    )
  })

  test('goes Home with a notice when the module whose page is open is switched off', async ({
    page,
  }) => {
    const team = createTeamFixture()
    const owner = team.members.owner
    if (!owner) throw new Error('No owner in the team')
    await signInWithTotp(page, totpCredentials(owner, team.password))
    await page.goto('/land')
    await expect(page.getByRole('heading', { name: 'Land & title' })).toBeVisible()

    setReleaseOverride(team.organizationId, 'land', 'off')
    await returnToTabUntil(page, () =>
      expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible({ timeout: 500 }),
    )

    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByText(
        "Land & title isn't available on your account right now. What you were typing wasn't saved.",
      ),
    ).toBeVisible()
  })
})

test.describe('a standard organization given an override', () => {
  test('shows the owner a plan hint once a Growth feature is released to it, and drops it when released off', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    await signInWithTotp(page, totpCredentials(org.owner, org.password))
    await openPalette(page)
    await page.getByPlaceholder('Type a page or action').fill('commissions')
    await expect(page.getByText('Available on Growth')).toHaveCount(0)
    await closePalette(page)

    releaseFlags(org.organizationId, COMMISSIONS_AND_WHAT_IT_NEEDS)
    await returnToTabUntil(page, () =>
      inPalette(page, async () => {
        await page.getByPlaceholder('Type a page or action').fill('commissions')
        await expect(page.getByText('Available on Growth')).toBeVisible({ timeout: 500 })
      }),
    )

    setReleaseOverride(org.organizationId, 'sales.commissions', 'off')
    await returnToTabUntil(page, () =>
      inPalette(page, async () => {
        await page.getByPlaceholder('Type a page or action').fill('commissions')
        await expect(page.getByText('Available on Growth')).toHaveCount(0, { timeout: 500 })
      }),
    )
  })
})

/** Records where "Talk to Vento" sends the browser, without leaving the app. */
async function recordTalkToVento(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { talkTo: string[] }
    w.talkTo = []
    window.open = (url) => {
      w.talkTo.push(String(url))
      return null
    }
    // A mailto: link is a navigation, which the Navigation API reports before it happens.
    ;(window as unknown as { navigation: EventTarget }).navigation?.addEventListener(
      'navigate',
      (event) => {
        const url = (event as unknown as { destination: { url: string } }).destination.url
        if (url.startsWith('mailto:') || url.includes('wa.me')) {
          w.talkTo.push(url)
          event.preventDefault()
        }
      },
    )
  })
}

test.describe('plan hints in search', () => {
  test('an owner who searches a Growth-only feature sees where it is available, and Enter opens Talk to Vento', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    releaseFlags(org.organizationId, COMMISSIONS_AND_WHAT_IT_NEEDS)
    await recordTalkToVento(page)
    await signInWithTotp(page, totpCredentials(org.owner, org.password))
    await openPalette(page)

    await page.getByPlaceholder('Type a page or action').fill('commissions')
    const row = page.getByRole('option', { name: /Available on Growth/ })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Talk to Vento')
    await page.keyboard.press('Enter')

    const targets = await page.evaluate(() => (window as unknown as { talkTo: string[] }).talkTo)
    expect(targets).toHaveLength(1)
    expect(decodeURIComponent(targets[0] ?? '')).toContain(org.organizationName)
    expect(decodeURIComponent(targets[0] ?? '')).toContain('Plan: Starter')
    expect(targets[0]).toMatch(/^(mailto:|https:\/\/wa\.me\/)/)
  })

  test('a member who is not an owner never sees plan hints', async ({ page }) => {
    const org = createStarterOrgFixture()
    releaseFlags(org.organizationId, COMMISSIONS_AND_WHAT_IT_NEEDS)
    await signInWithPassword(page, { email: org.sales.email, password: org.password })
    await openPalette(page)

    await page.getByPlaceholder('Type a page or action').fill('commissions')

    await expect(page.getByText('No pages or actions match "commissions".')).toBeVisible()
    await expect(page.getByText('Available on')).toHaveCount(0)
    await expect(page.getByText('Talk to Vento')).toHaveCount(0)
  })

  test('previewing a role hides the plan hints from the owner', async ({ page }, testInfo) => {
    // Preview as role lives in the desktop account menu; phones don't offer it (see theme-and-preview).
    test.skip(isMobile(testInfo), 'Preview as role is a desktop control')
    const org = createStarterOrgFixture()
    releaseFlags(org.organizationId, COMMISSIONS_AND_WHAT_IT_NEEDS)
    await signInWithTotp(page, totpCredentials(org.owner, org.password))
    await page.getByRole('button', { name: /^Account: / }).click()
    await page.getByRole('menuitem', { name: 'Preview as role' }).click()
    await page.getByRole('menuitemradio', { name: 'Sales' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Previewing as Sales.' })).toBeVisible()

    await openPalette(page)
    await page.getByPlaceholder('Type a page or action').fill('commissions')

    await expect(page.getByText('No pages or actions match "commissions".')).toBeVisible()
    await expect(page.getByText('Available on')).toHaveCount(0)
  })

  test('a feature switched on for the organization by an override is not offered as an upgrade', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    releaseFlags(org.organizationId, COMMISSIONS_AND_WHAT_IT_NEEDS)
    setFeatureOverride(org.organizationId, 'sales.commissions', 'on')
    await signInWithTotp(page, totpCredentials(org.owner, org.password))
    await openPalette(page)

    await page.getByPlaceholder('Type a page or action').fill('commissions')

    await expect(page.getByText('Available on Growth')).toHaveCount(0)
  })
})

test.describe('the trial line', () => {
  test('shows an owner a trial that ends within 7 days, with Talk to Vento', async ({ page }) => {
    const org = createStarterOrgFixture()
    startTrial(org.organizationId, 'growth', 5)

    await signInWithTotp(page, totpCredentials(org.owner, org.password))

    const line = page.getByRole('region', { name: 'Your trial' })
    await expect(line).toContainText(/Your Growth trial ends on \d{1,2} \w{3} \d{4}\./)
    await expect(line.getByRole('link', { name: 'Talk to Vento' })).toHaveAttribute(
      'href',
      /^(mailto:|https:\/\/wa\.me\/)/,
    )
  })

  test('shows nobody but the owner the trial line', async ({ page }) => {
    const org = createStarterOrgFixture()
    startTrial(org.organizationId, 'growth', 5)

    await signInWithPassword(page, { email: org.sales.email, password: org.password })

    await expect(page.getByRole('region', { name: 'Your trial' })).toHaveCount(0)
    await expect(page.getByText('trial ends')).toHaveCount(0)
  })

  test('stays quiet while the trial has more than 7 days to run', async ({ page }) => {
    const org = createStarterOrgFixture()
    startTrial(org.organizationId, 'growth', 20)

    await signInWithTotp(page, totpCredentials(org.owner, org.password))

    await expect(page.getByRole('region', { name: 'Your trial' })).toHaveCount(0)
  })
})

// Plan limits: no screen creates a project, entity or member yet (Team settings arrive in 3b), so
// no browser path can reach a count limit. The `plan_limit` FORBIDDEN shape and the concurrent
// create are covered by the API tests in apps/api/src/platform/limits*.test.ts.
test.skip('a create that would pass a plan limit shows the plan limit message', () => {})
