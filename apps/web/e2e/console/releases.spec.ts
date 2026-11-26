import { expect, type Page, test } from '@playwright/test'
import {
  expectNoSeriousViolations,
  goToSection,
  signInToConsole,
  useTheme,
} from '../support/console'
import { createSuperAdminFixture, flagStage } from '../support/fixtures'

// J-ADM-01 in the console. This spec owns two global release stages and puts both back:
// analytics.board_pack (desktop project) and documents.contracts (mobile project, the kill
// switch). Each project changes only its own key, and each describe runs in order.

const BOARD_PACK = 'analytics.board_pack'
const CONTRACTS = 'documents.contracts'
const RESTORED = 'internal'

const dialog = (page: Page) => page.getByRole('dialog').first()

async function openRelease(page: Page, label: string) {
  await goToSection(page, 'Releases')
  await expect(page.getByRole('heading', { name: 'Releases', level: 1 })).toBeVisible()
  await page
    .getByRole('link', { name: new RegExp(`^${label}`) })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible()
}

test.describe('moving a feature through its stages (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'Board pack belongs to the desktop project')
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => flagStage(BOARD_PACK, RESTORED))
  test.afterAll(() => flagStage(BOARD_PACK, RESTORED))

  test('the list shows the feature with its stage and the Stage filter narrows it', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/releases')

    await expect(page.getByRole('heading', { name: 'Releases', level: 1 })).toBeVisible()
    await expect(page.getByTestId('release-row').filter({ hasText: 'Board pack' })).toContainText(
      'Internal',
    )
    await page.getByRole('group', { name: 'Stage' }).getByRole('button', { name: 'Pilot' }).click()
    await expect(page.getByTestId('release-row').filter({ hasText: 'Board pack' })).toHaveCount(0)
  })

  test('moving Board pack to pilot previews the change, needs a reason and then shows Pilot', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openRelease(page, 'Board pack')

    await page.getByRole('group', { name: 'Stage' }).getByRole('button', { name: 'Pilot' }).click()

    await expect(dialog(page)).toContainText('Move Board pack to pilot?')
    await expect(
      dialog(page)
        .getByText(/organization/)
        .first(),
    ).toBeVisible()
    await expect(
      dialog(page).getByRole('button', { name: 'Move Board pack to pilot' }),
    ).toBeDisabled()
    await dialog(page).getByLabel('Reason').fill('Release 1 pilot')
    await dialog(page).getByRole('button', { name: 'Move Board pack to pilot' }).click()

    await expect(dialog(page)).toBeHidden()
    await expect(page.getByRole('button', { name: /^Pilot/, pressed: true })).toBeVisible()
    await expect(page.getByText('“Release 1 pilot”').first()).toBeVisible()
  })

  test('the current stage is not offered as a move', async ({ page }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openRelease(page, 'Board pack')

    await expect(page.getByRole('button', { name: /^Internal/, pressed: true })).toBeVisible()
    await page.getByRole('button', { name: /^Internal/, pressed: true }).click()

    await expect(dialog(page)).toHaveCount(0)
  })

  test('a stage changed elsewhere after the preview is refused as stale and the dialog stays open', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openRelease(page, 'Board pack')
    await page.getByRole('group', { name: 'Stage' }).getByRole('button', { name: 'Pilot' }).click()
    await expect(dialog(page).getByLabel('Reason')).toBeVisible()
    flagStage(BOARD_PACK, 'on')

    await dialog(page).getByLabel('Reason').fill('Second opinion')
    await dialog(page).getByRole('button', { name: 'Move Board pack to pilot' }).click()

    await expect(dialog(page).getByRole('alert')).toContainText(/changed|since|already/i)
    await expect(dialog(page).getByLabel('Reason')).toHaveValue('Second opinion')
    flagStage(BOARD_PACK, RESTORED)
  })

  test('a feature that does not exist is a 404 inside the console', async ({ page }) => {
    await signInToConsole(
      page,
      createSuperAdminFixture('member'),
      '/console/releases/not.a_feature',
    )

    await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to Organizations' })).toBeVisible()
  })
})

test.describe('the kill switch (phone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'Contracts belongs to the mobile project')
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => flagStage(CONTRACTS, RESTORED))
  test.afterAll(() => flagStage(CONTRACTS, RESTORED))

  test('turning a feature off for everyone asks, needs a reason, and shows when and why it went off', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openRelease(page, 'Contracts and e-signature')

    await page.getByRole('button', { name: 'Turn off for everyone' }).click()

    await expect(dialog(page)).toContainText('Turn off Contracts and e-signature for everyone?')
    await dialog(page).getByLabel('Reason').fill('Signing bug found')
    await dialog(page).getByRole('button', { name: 'Turn off Contracts and e-signature' }).click()

    await expect(
      page.getByRole('status').filter({ hasText: /^Off for everyone since/ }),
    ).toContainText('Signing bug found')
    await expect(page.getByRole('button', { name: 'Turn off for everyone' })).toBeDisabled()
  })

  test('the kill switch is on the page itself, not inside a menu', async ({ page }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openRelease(page, 'Contracts and e-signature')

    await expect(page.getByRole('region', { name: 'Kill switch' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn off for everyone' })).toBeVisible()
  })

  test('cancelling the kill switch changes nothing', async ({ page }) => {
    await signInToConsole(page, createSuperAdminFixture('member'))
    await openRelease(page, 'Contracts and e-signature')

    await page.getByRole('button', { name: 'Turn off for everyone' }).click()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Turn off for everyone' })).toBeEnabled()
  })
})

for (const theme of ['light', 'dark'] as const) {
  test(`Releases list has no serious accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    await useTheme(page, theme)
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/releases')
    await expect(page.getByRole('link', { name: /^Board pack/ }).first()).toBeVisible()

    await expectNoSeriousViolations(page)
  })

  test(`Feature page has no serious accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    // KNOWN APP BUG in light mode (reported, not fixed here): the unselected stage buttons
    // (muted text on the muted track) fail color-contrast. Remove this line once fixed.
    test.fail(
      theme === 'light',
      'Stage control: unselected buttons fail color-contrast in light mode',
    )
    await useTheme(page, theme)
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/releases')
    await page
      .getByRole('link', { name: /^Board pack/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: 'Board pack', level: 1 })).toBeVisible()

    await expectNoSeriousViolations(page)
  })
}
