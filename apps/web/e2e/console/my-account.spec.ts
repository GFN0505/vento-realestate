import { expect, type Page, test } from '@playwright/test'
import { expectNoSeriousViolations, signInAsStaff, useTheme } from '../support/console'
import { createSuperAdminFixture } from '../support/fixtures'
import { newestEmail } from '../support/mailbox'
import { card, saveBackupCodes, toastWith } from '../support/security'
import { enterPassword } from '../support/sign-in'
import { nextTotpCode } from '../support/totp'
import { addVirtualAuthenticator } from '../support/webauthn'

// J-ADM-07: a super-admin manages their own sign-in on /console/account, with My security's rules:
// two-step can't be turned off, passkeys, backup codes and sessions.

const NEW_PASSWORD = 'Lekki-sunrise-2027'

async function openAccount(page: Page) {
  await page.goto('/console/account')
  await expect(page.getByRole('heading', { name: 'My account', level: 1 })).toBeVisible()
}

/** A second device signed in as the same person; its code is the next window's (codes work once). */
async function secondDevice(
  page: Page,
  admin: { email: string; password: string; totpSecret: string },
) {
  await page.goto('/sign-in')
  await enterPassword(page, admin.email, admin.password)
  await page.getByLabel('6-digit code').fill(nextTotpCode(admin.totpSecret))
  await expect(page).toHaveURL(/\/console\/?$/)
}

test.describe('reaching My account', () => {
  test('it is in the user menu, or More on a phone, and shows the account line', async ({
    page,
    isMobile,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())

    if (isMobile) {
      await page
        .getByRole('navigation', { name: 'Tabs' })
        .getByRole('button', { name: 'More' })
        .click()
      await page
        .getByRole('dialog', { name: 'More' })
        .getByRole('link', { name: 'My account' })
        .click()
    } else {
      await page.getByRole('button', { name: /^Account: / }).click()
      await page.getByRole('menuitem', { name: 'My account' }).click()
    }

    await expect(page).toHaveURL(/\/console\/account$/)
    await expect(page.getByText('Your Vento Real Estate staff account.')).toBeVisible()
  })

  test('the profile shows the email, and two-step is required with no Turn off', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    await signInAsStaff(page, admin)
    await openAccount(page)

    const signIn = card(page, 'Sign-in')

    await expect(page.getByText(admin.email, { exact: true })).toBeVisible()
    await expect(signIn).toContainText('Required for Vento Real Estate staff')
    await expect(signIn.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
    await expect(signIn.getByText('10 of 10 left')).toBeVisible()
  })

  test('the server refuses turning two-step off for a super-admin', async ({ page }) => {
    const admin = createSuperAdminFixture()
    await signInAsStaff(page, admin)
    await openAccount(page)

    const reply = await page.evaluate(async (password) => {
      const res = await fetch('/api/auth/two-factor/disable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      return { status: res.status, body: await res.text() }
    }, admin.password)

    expect(reply.status).toBeGreaterThanOrEqual(400)
    expect(reply.body).toMatch(/super-admin|staff/i)
  })
})

test.describe('on a laptop', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'These flows change one account; the phone layout is in axe',
  )

  test('a name edited in place shows in the user menu, and an empty name is refused', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await openAccount(page)

    await page
      .getByRole('button', { name: /Edit your name/ })
      .first()
      .click()
    await page.getByRole('textbox', { name: 'Your name' }).fill('   ')
    await page.getByRole('textbox', { name: 'Your name' }).press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'Enter your name' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Your name' }).fill('Chika Obi-Eze')
    await page.getByRole('textbox', { name: 'Your name' }).press('Enter')

    await expect(toastWith(page, 'Name updated')).toBeVisible()
    await page.getByRole('button', { name: /^Account: / }).click()
    await expect(page.getByRole('menu').getByText('Chika Obi-Eze')).toBeVisible()
  })

  test('changing the password needs the current one, ends other devices and the new one works', async ({
    page,
    browser,
  }) => {
    const admin = createSuperAdminFixture()
    await signInAsStaff(page, admin)
    const phone = await browser.newContext()
    const other = await phone.newPage()
    await secondDevice(other, admin)
    await openAccount(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Change password' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change password' })

    await dialog.getByLabel('Current password').fill('Not-my-password-1')
    await dialog.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await dialog.getByLabel('Confirm password').fill(NEW_PASSWORD)
    await dialog.getByRole('button', { name: 'Change password' }).click()
    await expect(dialog.getByText("That's not your current password.")).toBeVisible()
    await dialog.getByLabel('Current password').fill(admin.password)
    await dialog.getByRole('button', { name: 'Change password' }).click()

    await expect(toastWith(page, /Password changed\. Signed out of \d+ devices?\./)).toBeVisible()
    await other.goto('/console/releases')
    await expect(other.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    const mail = await newestEmail(admin.email, 'security_alert')
    expect(mail.subject.toLowerCase()).toContain('password')
    await phone.close()
  })

  test('new backup codes replace the old ones at once', async ({ page, browser }) => {
    const admin = createSuperAdminFixture()
    await signInAsStaff(page, admin)
    await openAccount(page)

    await card(page, 'Sign-in').getByRole('button', { name: 'Make new codes' }).click()
    const dialog = page.getByRole('dialog', { name: 'New backup codes' })
    await dialog.getByLabel('Password', { exact: true }).fill(admin.password)
    await dialog.getByRole('button', { name: 'Make new codes' }).click()
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeDisabled()
    const fresh = await saveBackupCodes(dialog)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(toastWith(page, 'New backup codes saved')).toBeVisible()

    const old = await browser.newContext()
    const oldPage = await old.newPage()
    await oldPage.goto('/sign-in')
    await enterPassword(oldPage, admin.email, admin.password)
    await oldPage.getByRole('button', { name: 'Use a backup code' }).click()
    await oldPage.getByLabel('Backup code').fill(admin.backupCodes[0] ?? '')
    await oldPage.getByRole('button', { name: 'Verify' }).click()
    await expect(oldPage.getByRole('alert')).toBeVisible()
    await oldPage.getByLabel('Backup code').fill(fresh[0] ?? '')
    await oldPage.getByRole('button', { name: 'Verify' }).click()
    await expect(oldPage).toHaveURL(/\/console\/?$/)
    await old.close()
  })

  test('the sessions list marks this device and signing out another device ends it at once', async ({
    page,
    browser,
  }) => {
    const admin = createSuperAdminFixture()
    await signInAsStaff(page, admin)
    const phone = await browser.newContext()
    const other = await phone.newPage()
    await secondDevice(other, admin)
    await openAccount(page)
    const devices = card(page, "Where you're signed in")
    const rows = devices.getByRole('list', { name: 'Devices' }).getByRole('listitem')
    // The fixture's own sign-up session is listed too, so count from what is there.
    await expect(rows.nth(1)).toBeVisible()
    const before = await rows.count()
    await expect(rows.first()).toContainText('This device')

    await rows
      .nth(1)
      .getByRole('button', { name: /^Sign out/ })
      .click()

    await expect(toastWith(page, /^Signed out of /)).toBeVisible()
    await expect(rows).toHaveCount(before - 1)
    await other.goto('/console/releases')
    await expect(other.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    await phone.close()
  })

  test('Sign out other devices asks first, then ends the other session', async ({
    page,
    browser,
  }) => {
    const admin = createSuperAdminFixture()
    await signInAsStaff(page, admin)
    const phone = await browser.newContext()
    const other = await phone.newPage()
    await secondDevice(other, admin)
    await openAccount(page)
    const devices = card(page, "Where you're signed in")

    await devices.getByRole('button', { name: 'Sign out other devices' }).click()
    await page.getByRole('button', { name: /^Sign out \d+ devices?$/ }).click()

    await expect(toastWith(page, /Signed out of \d+ other devices?/)).toBeVisible()
    await expect(devices.getByRole('button', { name: 'Sign out other devices' })).toHaveCount(0)
    await phone.close()
  })
})

test.describe('passkeys (desktop)', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'The virtual authenticator is driven on the desktop project',
  )

  test('add, rename and remove a passkey', async ({ page }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await addVirtualAuthenticator(page)
    await openAccount(page)
    const passkeys = card(page, 'Passkeys')
    const list = passkeys.getByRole('list', { name: 'Passkeys' }).getByRole('listitem')

    await passkeys.getByRole('button', { name: 'Add a passkey' }).first().click()
    await expect(toastWith(page, /^Passkey added/)).toBeVisible()
    await expect(list).toHaveCount(1)
    await page.getByRole('button', { name: 'Rename', exact: true }).click()
    await page.getByRole('textbox', { name: 'Passkey name' }).fill('Work laptop')
    await page.getByRole('textbox', { name: 'Passkey name' }).press('Enter')
    await expect(list.first()).toContainText('Work laptop')
    await page.getByRole('button', { name: 'Actions for Work laptop' }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    await page
      .getByRole('alertdialog', { name: /^Remove / })
      .getByRole('button', { name: 'Remove passkey' })
      .click()

    await expect(passkeys.getByText('No passkeys yet.')).toBeVisible()
  })
})

for (const theme of ['light', 'dark'] as const) {
  test(`My account has no serious accessibility violations in ${theme} mode`, async ({ page }) => {
    await useTheme(page, theme)
    await signInAsStaff(page, createSuperAdminFixture())
    await openAccount(page)

    await expectNoSeriousViolations(page)
  })
}

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('My account fits without sideways scrolling and has no serious violations', async ({
    page,
  }) => {
    await signInAsStaff(page, createSuperAdminFixture())
    await openAccount(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoSeriousViolations(page)
  })
})
