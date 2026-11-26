import { expect, type Page, test } from '@playwright/test'
import {
  confirmWithCode,
  expectNoSeriousViolations,
  openOrganization,
  proofDialog,
  STAFF_LABEL,
  signInToConsole,
  useTheme,
} from '../support/console'
import {
  ageConsole,
  agePasskeys,
  ageSecondFactor,
  createMemberFixture,
  createStarterOrgFixture,
  createSuperAdminFixture,
} from '../support/fixtures'
import { card, openSecurity, toastWith } from '../support/security'
import { enterPassword, signInWithTotp } from '../support/sign-in'
import { totpCode } from '../support/totp'
import { addVirtualAuthenticator } from '../support/webauthn'

// Access to the Vento console (decision 0021, plan section 11): customers get a 404 and never
// download console code; a super-admin enters through a fresh code, backup code or passkey.

const NOT_FOUND = "We can't find that page"
const ORGANIZATIONS = { name: 'Organizations', level: 1 } as const

/** Records every JavaScript response body, to prove what the browser was (not) sent. */
function recordScripts(page: Page) {
  const bodies: { url: string; text: string }[] = []
  page.on('response', async (response) => {
    const type = response.headers()['content-type'] ?? ''
    if (!/javascript|ecmascript/.test(type)) return
    const text = await response.text().catch(() => '')
    bodies.push({ url: response.url(), text })
  })
  return bodies
}

const leaked = (bodies: { url: string; text: string }[]) =>
  bodies.filter((s) => s.text.includes(STAFF_LABEL)).map((s) => s.url)

/** Closes the console window and the 5-minute proof, so the next visit asks. */
function closeWindowAndProof(email: string) {
  ageConsole(email, 'idle')
  ageSecondFactor(email)
}

async function openUserMenuEntry(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole('navigation', { name: 'Tabs' })
      .getByRole('button', { name: 'More' })
      .click()
    return page.getByRole('dialog', { name: 'More' })
  }
  await page.getByRole('button', { name: /^Account: / }).click()
  return page.getByRole('menu')
}

test.describe('customers and everyone else', () => {
  test('an owner gets a 404 on /console and no console code is sent to the browser', async ({
    page,
  }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const scripts = recordScripts(page)

    await page.goto('/console')

    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
    await expect(page.getByText(STAFF_LABEL)).toHaveCount(0)
    expect(scripts.length).toBeGreaterThan(0)
    expect(leaked(scripts)).toEqual([])
  })

  test('an owner has no Vento console in the user menu and gets a 404 on /console/releases', async ({
    page,
    isMobile,
  }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const menu = await openUserMenuEntry(page, isMobile)
    await expect(menu.getByText('My security')).toBeVisible()
    await expect(menu.getByText('Vento console')).toHaveCount(0)

    await page.goto('/console/releases')

    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
  })

  test('a revoked super-admin gets a 404 on /console and no console code is sent', async ({
    page,
  }) => {
    const revoked = createSuperAdminFixture('revoked')
    await signInWithTotp(page, revoked)
    const scripts = recordScripts(page)

    await page.goto('/console')

    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
    expect(leaked(scripts)).toEqual([])
  })

  test('a signed-out visitor gets a 404 on /console, not the sign-in page', async ({ page }) => {
    const scripts = recordScripts(page)

    await page.goto('/console')

    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
    expect(leaked(scripts)).toEqual([])
  })
})

test.describe('a super-admin entering', () => {
  test('signing in with a code opens the console from the user menu without a prompt', async ({
    page,
    isMobile,
  }) => {
    const admin = createSuperAdminFixture('member')
    await signInWithTotp(page, admin)

    const menu = await openUserMenuEntry(page, isMobile)
    await menu.getByText('Vento console').click()

    await expect(page).toHaveURL(/\/console$/)
    await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()
    await expect(page.getByText(STAFF_LABEL).locator('visible=true').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toHaveCount(0)
  })

  test('with the window and the last proof both expired it asks, and a code opens it', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    closeWindowAndProof(admin.email)

    await page.goto('/console')
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toBeVisible()
    await confirmWithCode(page, admin.totpSecret)

    await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toHaveCount(0)
  })

  test('a wrong code is refused with a message and the card stays open', async ({ page }) => {
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    closeWindowAndProof(admin.email)

    await page.goto('/console')
    await page.getByLabel('6-digit code').fill('000000')

    await expect(page.getByRole('alert').filter({ hasText: /code/i }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toBeVisible()
  })

  test('a backup code opens it once, and the same backup code is refused the second time', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    const code = admin.backupCodes[0] ?? ''
    await signInToConsole(page, admin)
    closeWindowAndProof(admin.email)
    await page.goto('/console')
    await page.getByRole('button', { name: 'Use a backup code' }).click()
    await page.getByLabel('Backup code').fill(code)
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()

    closeWindowAndProof(admin.email)
    await page.goto('/console')
    await page.getByRole('button', { name: 'Use a backup code' }).click()
    await page.getByLabel('Backup code').fill(code)
    await page.getByRole('button', { name: 'Confirm' }).click()

    await expect(page.getByRole('alert').filter({ hasText: /code/i }).first()).toBeVisible()
    await expect(page.getByRole('heading', ORGANIZATIONS)).toHaveCount(0)
  })

  test('a window that only went idle, with the sign-in proof still fresh, reopens without a prompt', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    ageConsole(admin.email, 'idle')

    await page.goto('/console')

    await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toHaveCount(0)
  })

  test('a super-admin with no organization lands on the console after signing in', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('no-org')

    await page.goto('/sign-in')
    await enterPassword(page, admin.email, admin.password)
    await page.getByLabel('6-digit code').fill(totpCode(admin.totpSecret))

    await expect(page).toHaveURL(/\/console$/)
    await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()
    await expect(page.getByText(STAFF_LABEL).locator('visible=true').first()).toBeVisible()
  })

  test('a super-admin whose two-step was reset is told to set it up again', async ({ page }) => {
    const admin = createSuperAdminFixture('two-step-reset')
    await page.goto('/sign-in')
    await enterPassword(page, admin.email, admin.password)
    await expect(page).toHaveURL(/two-step\/setup|\/$/)

    await page.goto('/console')

    await expect(
      page.getByRole('heading', { name: 'Set up two-step to use the Vento console.' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Set up two-step' })).toBeVisible()
  })
})

/** Opens the console with a code, which makes a passkey added earlier count. */
async function openWithCode(page: Page, admin: { email: string; totpSecret: string }) {
  closeWindowAndProof(admin.email)
  await page.goto('/console')
  await page.getByRole('button', { name: 'Use a code instead' }).click()
  await confirmWithCode(page, admin.totpSecret)
  await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()
}

test.describe('a passkey', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'The virtual authenticator is driven on the desktop project',
  )

  async function addPasskey(page: Page) {
    const authenticator = await addVirtualAuthenticator(page)
    await openSecurity(page)
    await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).first().click()
    await expect(toastWith(page, /^Passkey added/)).toBeVisible()
    return authenticator
  }

  test('a passkey added after the last code is refused with a message until a code is used', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    await signInWithTotp(page, admin)
    await addPasskey(page)
    closeWindowAndProof(admin.email)

    await page.goto('/console')
    await page.getByRole('button', { name: 'Use passkey' }).click()

    await expect(page.getByText(/This passkey was added after you last used a code/)).toBeVisible()
    await expect(page.getByRole('heading', ORGANIZATIONS)).toHaveCount(0)
  })

  // A passkey only counts once a code was used after it was added; age-passkeys backdates it to
  // before the aged code, as if it had been added long ago.
  test('opens the console through Use passkey once a code has been used since it was added', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    await signInWithTotp(page, admin)
    await addPasskey(page)
    await openWithCode(page, admin)
    closeWindowAndProof(admin.email)
    agePasskeys(admin.email)

    await page.goto('/console')
    await page.getByRole('button', { name: 'Use passkey' }).click()

    await expect(page.getByRole('heading', ORGANIZATIONS)).toBeVisible()
  })

  test('a refused passkey keeps the card open and offers the code instead', async ({ page }) => {
    const admin = createSuperAdminFixture('member')
    await signInWithTotp(page, admin)
    await addPasskey(page)
    closeWindowAndProof(admin.email)

    await page.goto('/console')
    await page.getByRole('button', { name: 'Use passkey' }).click()

    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toBeVisible()
    await page.getByRole('button', { name: 'Use a code instead' }).click()
    await expect(page.getByLabel('6-digit code')).toBeVisible()
  })
})

/** Opens the starter organization's Start trial sheet at its reason step. */
async function openStartTrial(
  page: Page,
  org: { organizationName: string; organizationId: string },
  reason: string,
) {
  await openOrganization(page, org)
  await page.getByRole('button', { name: 'More changes' }).click()
  await page.getByRole('menuitem', { name: 'Start trial' }).click()
  const sheet = page.getByRole('dialog', { name: /trial/ })
  await sheet.getByRole('button', { name: 'Review' }).click()
  await sheet.getByLabel('Reason').fill(reason)
  return sheet
}

test.describe('the window running out mid-task', () => {
  test('the dialog opens over the Start trial sheet and the trial starts once after the code, with the same key', async ({
    page,
  }) => {
    const org = createStarterOrgFixture()
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    const sheet = await openStartTrial(page, org, 'Board pack trial')
    const keys: string[] = []
    page.on('request', (request) => {
      if (!request.url().includes('startTrial') || request.method() !== 'POST') return
      const key = /"idempotencyKey":"([^"]+)"/.exec(request.postData() ?? '')?.[1]
      if (key) keys.push(key)
    })
    closeWindowAndProof(admin.email)

    await sheet.getByRole('button', { name: 'Start 30-day trial' }).click()

    await expect(proofDialog(page)).toBeVisible()
    await expect(page.getByText(/Your change is still here/)).toBeVisible()
    await expect(sheet.getByLabel('Reason')).toHaveValue('Board pack trial')
    await confirmWithCode(proofDialog(page), admin.totpSecret)
    await expect(proofDialog(page)).toBeHidden()
    await expect(sheet).toBeHidden()
    await expect(page.getByText(/trial/i).first()).toBeVisible()
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(new Set(keys).size).toBe(1)
  })

  test('Escape on the dialog does not close the sheet or lose its reason', async ({ page }) => {
    const org = createStarterOrgFixture()
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    const sheet = await openStartTrial(page, org, 'Keep this reason')
    closeWindowAndProof(admin.email)
    await sheet.getByRole('button', { name: 'Start 30-day trial' }).click()
    await expect(proofDialog(page)).toBeVisible()
    await expect
      .poll(() => proofDialog(page).evaluate((el) => el.contains(document.activeElement)))
      .toBe(true)

    await page.keyboard.press('Escape')

    // The dialog may ask again on the next console request, so only the sheet is asserted.
    await expect(sheet).toBeVisible()
    await expect(sheet.getByLabel('Reason')).toHaveValue('Keep this reason')
  })

  // KNOWN APP BUG (reported, not fixed here): when the dialog closes, focus falls to <body>
  // instead of returning inside the sheet. The button that opened the dialog is disabled while
  // the change is applying, so Radix's return-focus has nowhere to go. Remove test.fail() once fixed.
  test('focus returns inside the sheet when the dialog is closed with Escape', async ({ page }) => {
    test.fail(true, 'Focus is lost to <body> after the dialog closes over the sheet')
    const org = createStarterOrgFixture()
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)
    const sheet = await openStartTrial(page, org, 'Keep this reason')
    closeWindowAndProof(admin.email)
    await sheet.getByRole('button', { name: 'Start 30-day trial' }).click()
    await expect(proofDialog(page)).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(proofDialog(page)).toBeHidden()
    await expect.poll(() => sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  })
})

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the staff label is visible and nothing scrolls sideways', async ({ page }) => {
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin)

    await expect(page.getByText(STAFF_LABEL).locator('visible=true').first()).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

for (const theme of ['light', 'dark'] as const) {
  test(`Confirm it's you has no serious accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    await useTheme(page, theme)
    await signInToConsole(page, admin)
    closeWindowAndProof(admin.email)
    await page.goto('/console')
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)

    await expectNoSeriousViolations(page)
  })
}
