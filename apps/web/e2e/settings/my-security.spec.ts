import { expect, type Page } from '@playwright/test'
import { createSecurityTeamFixture, forceReset } from '../support/fixtures'
import { newestEmail } from '../support/mailbox'
import {
  card,
  finishTwoStepSheet,
  openSecurity,
  saveBackupCodes,
  toastWith,
} from '../support/security'
import { isMobile, sharedTeam, test } from '../support/shell'
import {
  enterPassword,
  HOME_GREETING,
  runCommand,
  signInWithPassword,
  signInWithTotp,
} from '../support/sign-in'
import { nextTotpCode } from '../support/totp'

// J-ONB-09: secure your own account. Entry points run on both projects; the rest changes one
// person's account on a laptop, each test in its own organization so nothing else is touched.

const NEW_PASSWORD = 'Lekki-sunrise-2027'

async function openMore(page: Page) {
  await page.getByRole('navigation', { name: 'Tabs' }).getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await expect(sheet).toBeVisible()
  return sheet
}

async function openPalette(page: Page) {
  await page.getByRole('button', { name: /Search or run a command/ }).click()
  await expect(page.getByRole('dialog', { name: 'Search or run a command' })).toBeVisible()
}

test.describe('reaching My security', () => {
  test('a sales member opens it from the user menu, or More on a phone, and sees their own account', async ({
    as,
  }, testInfo) => {
    const grace = (await sharedTeam()).members.sales
    if (!grace) throw new Error('no sales member')
    const page = await as('sales')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

    if (isMobile(testInfo)) {
      const sheet = await openMore(page)
      await sheet.getByRole('link', { name: 'My security' }).click()
    } else {
      await page.getByRole('button', { name: /^Account: / }).click()
      await page.getByRole('menuitem', { name: 'My security' }).click()
    }

    await expect(page).toHaveURL(/\/settings\/security$/)
    await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
    await expect(page.getByText(grace.email, { exact: true })).toBeVisible()
    await expect(
      page.getByText('This is your Vento Real Estate account in every organization'),
    ).toBeVisible()
  })

  test('the command palette offers Go to My security, Change password and Turn on two-step to a member without two-step', async ({
    as,
  }) => {
    const page = await as('sales')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

    await openPalette(page)
    await expect(page.getByRole('option', { name: /Go to My security/ })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Change password' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Turn on two-step' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Add a passkey' })).toBeVisible()

    await page.getByRole('option', { name: /Go to My security/ }).click()
    await expect(page).toHaveURL(/\/settings\/security$/)
  })

  test('Change password from the palette opens the dialog once and clears ?do= so Reload does not repeat it', async ({
    as,
  }) => {
    const page = await as('sales')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

    await openPalette(page)
    await page.getByRole('option', { name: 'Change password' }).click()

    const dialog = page.getByRole('dialog', { name: 'Change password' })
    await expect(dialog).toBeVisible()
    await expect(page).not.toHaveURL(/do=/)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('?do=turn-on opens the two-step sheet straight from an address', async ({ as }) => {
    const page = await as('sales')
    await page.goto('/settings/security?do=turn-on')

    await expect(page.getByRole('dialog', { name: 'Set up two-step sign-in' })).toBeVisible()
    await expect(page).not.toHaveURL(/do=/)
  })

  test('a sales member typing /settings lands on My security while /settings/team still says 403', async ({
    as,
  }) => {
    const page = await as('sales')

    await page.goto('/settings')
    await expect(page).toHaveURL(/\/settings\/security$/)
    await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
    // One section only: no sub-navigation is drawn.
    await expect(page.getByRole('navigation', { name: 'Settings' })).toHaveCount(0)

    await page.goto('/settings/team')
    await expect(
      page.getByRole('heading', { name: "You don't have access to Settings" }),
    ).toBeVisible()
  })

  test('an owner sees My security as the last entry of the settings navigation', async ({
    as,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'The sub-navigation is a list screen on phones')
    const page = await as('owner')
    await page.goto('/settings/organization')

    const links = page.getByRole('navigation', { name: 'Settings' }).getByRole('link')
    await expect(links.last()).toHaveText('My security')
  })

  test('an admin previewing as Sales still sees their own account on My security', async ({
    as,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'Preview as role lives in the sidebar menu on desktop')
    const admin = (await sharedTeam()).members.admin
    if (!admin) throw new Error('no admin member')
    const page = await as('admin')
    await page.goto('/')
    await page.getByRole('button', { name: /^Account: / }).click()
    await page.getByRole('menuitem', { name: 'Preview as role' }).click()
    await page.getByRole('menuitemradio', { name: /^Sales/ }).click()
    await expect(page.getByText('Previewing as Sales')).toBeVisible()

    await page.getByRole('button', { name: /^Account: / }).click()
    await page.getByRole('menuitem', { name: 'My security' }).click()

    await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
    await expect(page.getByText(admin.email, { exact: true })).toBeVisible()
  })
})

test.describe('on a laptop', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'These flows change one account; the phone layout is in axe',
  )

  test('a name edited in place shows in the user menu, Esc keeps the old one and an empty name is refused', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInWithPassword(page, { email: members.viewer.email, password })
    await openSecurity(page)

    await page
      .getByRole('button', { name: /Edit your name/ })
      .first()
      .click()
    const field = page.getByRole('textbox', { name: 'Your name' })
    await field.fill('Someone Else')
    await field.press('Escape')
    await expect(page.getByRole('button', { name: /^Yusuf Ibrahim\./ })).toBeVisible()

    await page
      .getByRole('button', { name: /Edit your name/ })
      .first()
      .click()
    await page.getByRole('textbox', { name: 'Your name' }).fill('   ')
    await page.getByRole('textbox', { name: 'Your name' }).press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'Enter your name' })).toBeVisible()

    await page.getByRole('textbox', { name: 'Your name' }).fill('Yusuf Ibrahim-Musa')
    await page.getByRole('textbox', { name: 'Your name' }).press('Enter')
    await expect(toastWith(page, 'Name updated')).toBeVisible()
    await page.getByRole('button', { name: /^Account: / }).click()
    await expect(page.getByRole('menu').getByText('Yusuf Ibrahim-Musa')).toBeVisible()
  })

  test('a wrong current password is named on the field, then the right one changes it and ends other devices', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const grace = members.sales
    await signInWithPassword(page, { email: grace.email, password })
    const phone = await browser.newContext()
    const other = await phone.newPage()
    await signInWithPassword(other, { email: grace.email, password })
    await openSecurity(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Change password' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change password' })

    await dialog.getByLabel('Current password').fill('Not-my-password-1')
    await dialog.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await dialog.getByLabel('Confirm password').fill(NEW_PASSWORD)
    await dialog.getByRole('button', { name: 'Change password' }).click()
    await expect(dialog.getByText("That's not your current password.")).toBeVisible()

    await dialog.getByLabel('Current password').fill(password)
    await dialog.getByRole('button', { name: 'Change password' }).click()

    await expect(toastWith(page, 'Password changed. Signed out of 1 device.')).toBeVisible()
    await expect(dialog).toBeHidden()
    // This device stays signed in; the other one is told its session has ended.
    await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
    await other.reload()
    await expect(other).toHaveURL(/\/sign-in/)
    const mail = await newestEmail(grace.email, 'security_alert')
    expect(mail.subject.toLowerCase()).toContain('password')
    await phone.close()

    const fresh = await browser.newContext()
    const again = await fresh.newPage()
    await signInWithPassword(again, { email: grace.email, password: NEW_PASSWORD })
    await fresh.close()
  })

  test('ten wrong current passwords in a row lock sign-in and the dialog says so', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInWithPassword(page, { email: members.viewer.email, password })
    await openSecurity(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Change password' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change password' })

    for (let attempt = 1; attempt <= 10; attempt++) {
      await dialog.getByLabel('Current password').fill(`Wrong-password-${attempt}`)
      await dialog.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
      await dialog.getByLabel('Confirm password').fill(NEW_PASSWORD)
      await dialog.getByRole('button', { name: 'Change password' }).click()
      await expect(dialog.getByRole('alert').first()).toBeVisible()
    }

    await expect(dialog.getByRole('alert').filter({ hasText: /locked|Too many/ })).toBeVisible()
    // The lock is on the account: a new sign-in is refused too, with the same words.
    const lockedOut = await page.context().browser()?.newContext()
    if (!lockedOut) throw new Error('no browser')
    const fresh = await lockedOut.newPage()
    await fresh.goto('/sign-in')
    await enterPassword(fresh, members.viewer.email, password)
    await expect(fresh.getByRole('alert')).toContainText(/Too many wrong passwords|locked/)
    await lockedOut.close()
  })

  test('turning two-step on takes the password and a code, shows ten codes once, and the card reads On', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInWithPassword(page, { email: members.sales.email, password })
    await openSecurity(page)
    const signIn = card(page, 'Sign-in')
    await expect(signIn.getByText('Off', { exact: true })).toBeVisible()

    await signIn.getByRole('button', { name: 'Turn on' }).click()
    const sheet = page.getByRole('dialog', { name: 'Set up two-step sign-in' })
    await sheet.getByLabel('Password', { exact: true }).fill('Not-my-password-1')
    await sheet.getByRole('button', { name: 'Continue' }).click()
    await expect(sheet.getByRole('alert')).toBeVisible()
    await sheet.getByLabel('Password', { exact: true }).fill(password)
    await sheet.getByRole('button', { name: 'Continue' }).click()
    await sheet.getByLabel('6-digit code').fill('000000')
    await expect(sheet.getByRole('alert')).toContainText("That code didn't match")
    // The QR code and the key stay while the person tries again.
    await expect(sheet.getByText(/^([A-Z2-7]{4} ){3,}[A-Z2-7]{1,4}$/)).toBeVisible()
    await page.keyboard.press('Escape')

    await signIn.getByRole('button', { name: 'Turn on' }).click()
    await finishTwoStepSheet(page, password)

    await expect(toastWith(page, 'Two-step is on')).toBeVisible()
    await expect(signIn.getByText('On', { exact: true })).toBeVisible()
    await expect(signIn.getByText('10 of 10 left')).toBeVisible()
    await expect(signIn.getByRole('button', { name: 'Turn off' })).toBeVisible()
  })

  test('new backup codes replace the old ones at once, and Done waits for the tick', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const grace = members.sales
    await signInWithPassword(page, { email: grace.email, password })
    await openSecurity(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Turn on' }).click()
    const first = await finishTwoStepSheet(page, password)

    await card(page, 'Sign-in').getByRole('button', { name: 'Make new codes' }).click()
    const dialog = page.getByRole('dialog', { name: 'New backup codes' })
    await dialog.getByLabel('Password', { exact: true }).fill(password)
    await dialog.getByRole('button', { name: 'Make new codes' }).click()
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeDisabled()
    const fresh = await saveBackupCodes(dialog)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(toastWith(page, 'New backup codes saved')).toBeVisible()
    expect(fresh).not.toEqual(first.backupCodes)

    const old = await browser.newContext()
    const oldPage = await old.newPage()
    await oldPage.goto('/sign-in')
    await enterPassword(oldPage, grace.email, password)
    await oldPage.getByRole('button', { name: 'Use a backup code' }).click()
    await oldPage.getByLabel('Backup code').fill(first.backupCodes[0] ?? '')
    await oldPage.getByRole('button', { name: 'Verify' }).click()
    await expect(oldPage.getByRole('alert')).toBeVisible()
    await oldPage.getByLabel('Backup code').fill(fresh[0] ?? '')
    await oldPage.getByRole('button', { name: 'Verify' }).click()
    await expect(oldPage.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    await old.close()
  })

  test('closing the new-codes dialog before the tick leaves the new codes in force', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInWithPassword(page, { email: members.sales.email, password })
    await openSecurity(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Turn on' }).click()
    await finishTwoStepSheet(page, password)
    await card(page, 'Sign-in').getByRole('button', { name: 'Make new codes' }).click()
    const dialog = page.getByRole('dialog', { name: 'New backup codes' })
    await dialog.getByLabel('Password', { exact: true }).fill(password)
    await dialog.getByRole('button', { name: 'Make new codes' }).click()
    await expect(dialog.getByRole('list', { name: 'Backup codes' })).toBeVisible()

    // The tab is reloaded as if the connection dropped: the row still reads 10 of 10.
    await page.reload()

    await expect(card(page, 'Sign-in').getByText('10 of 10 left')).toBeVisible()
    await expect(
      card(page, 'Sign-in').getByRole('button', { name: 'Make new codes' }),
    ).toBeVisible()
  })

  test('turning two-step off needs the password and a code, then says it is off and emails the member', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const grace = members.sales
    await signInWithPassword(page, { email: grace.email, password })
    await openSecurity(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Turn on' }).click()
    const { secret } = await finishTwoStepSheet(page, password)

    await card(page, 'Sign-in').getByRole('button', { name: 'Turn off' }).click()
    const dialog = page.getByRole('dialog', { name: 'Turn off two-step?' })
    await dialog.getByLabel('Password', { exact: true }).fill('Not-my-password-1')
    await dialog.getByLabel('6-digit code').fill(nextTotpCode(secret))
    await dialog.getByRole('button', { name: 'Turn off two-step' }).click()
    await expect(dialog.getByText("That's not your password.")).toBeVisible()

    await dialog.getByLabel('Password', { exact: true }).fill(password)
    await dialog.getByLabel('6-digit code').fill('000000')
    await dialog.getByRole('button', { name: 'Turn off two-step' }).click()
    await expect(dialog.getByRole('alert').filter({ hasText: /didn't match|code/ })).toBeVisible()

    await dialog.getByLabel('6-digit code').fill(nextTotpCode(secret))
    await dialog.getByRole('button', { name: 'Turn off two-step' }).click()

    await expect(toastWith(page, 'Two-step is off')).toBeVisible()
    await expect(card(page, 'Sign-in').getByText('Off', { exact: true })).toBeVisible()
    await expect(card(page, 'Sign-in').getByText(/left/)).toHaveCount(0)
    const mail = await newestEmail(grace.email, 'security_alert')
    expect(mail.subject.toLowerCase()).toContain('two-step')
  })

  test('a role that requires two-step shows why on the row, has no Turn off and the server refuses it', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInWithTotp(page, {
      email: members.finance.email,
      password,
      totpSecret: members.finance.totpSecret ?? '',
    })
    await openSecurity(page)
    const signIn = card(page, 'Sign-in')

    await expect(signIn.getByText('Required for your role (Finance)')).toBeVisible()
    await expect(signIn.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
    const reply = await page.evaluate(async (pw) => {
      const res = await fetch('/api/auth/two-factor/disable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw, code: '123456' }),
      })
      return { status: res.status, body: await res.text() }
    }, password)
    expect(reply.status).toBeGreaterThanOrEqual(400)
    expect(reply.body).toContain('Finance')
  })

  test('the sessions list marks this device, signs one out at once, and a stale row says the list is up to date', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const grace = members.sales
    await signInWithPassword(page, { email: grace.email, password })
    const phone = await browser.newContext()
    const other = await phone.newPage()
    await signInWithPassword(other, { email: grace.email, password })

    await openSecurity(page)
    const devices = card(page, "Where you're signed in")
    await expect(devices.getByText('Signed in on 2 devices')).toBeVisible()
    const rows = devices.getByRole('list', { name: 'Devices' }).getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('This device')
    await expect(rows.first()).toContainText(/Signed in \d{1,2} \w{3}, \d{2}:\d{2}/)
    // Loopback addresses (every e2e run) are never shown.
    await expect(devices).not.toContainText('IP ')
    await expect(rows.first().getByRole('button', { name: /^Sign out/ })).toHaveCount(0)

    // The other device signs itself out while this list is open.
    await runCommand(other, 'Sign out')
    await expect(other.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await rows
      .nth(1)
      .getByRole('button', { name: /^Sign out/ })
      .click()
    await expect(
      toastWith(page, 'That device is already signed out. The list is up to date.'),
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    await phone.close()
  })

  test('signing out one device ends its session at once, and the list drops it', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const grace = members.sales
    await signInWithPassword(page, { email: grace.email, password })
    const phone = await browser.newContext()
    const other = await phone.newPage()
    await signInWithPassword(other, { email: grace.email, password })
    await openSecurity(page)
    const rows = card(page, "Where you're signed in").getByRole('listitem')

    await rows
      .nth(1)
      .getByRole('button', { name: /^Sign out/ })
      .click()

    await expect(toastWith(page, /^Signed out of /)).toBeVisible()
    await expect(rows).toHaveCount(1)
    await other.reload()
    await expect(other).toHaveURL(/\/sign-in/)
    await phone.close()
  })

  test('Sign out other devices asks first, then ends every other session', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const grace = members.sales
    await signInWithPassword(page, { email: grace.email, password })
    const contexts = [await browser.newContext(), await browser.newContext()]
    const others = await Promise.all(contexts.map((c) => c.newPage()))
    for (const p of others) await signInWithPassword(p, { email: grace.email, password })
    await openSecurity(page)
    const devices = card(page, "Where you're signed in")
    await expect(devices.getByText('Signed in on 3 devices')).toBeVisible()

    await devices.getByRole('button', { name: 'Sign out other devices' }).click()
    const confirm = page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog', { name: /^Sign out 2 other devices/ }))
    await expect(confirm.getByText('Sign out 2 other devices?')).toBeVisible()
    await confirm.getByRole('button', { name: 'Sign out 2 devices' }).click()

    await expect(toastWith(page, 'Signed out of 2 other devices')).toBeVisible()
    await expect(devices.getByText('Signed in on 1 device')).toBeVisible()
    await expect(devices.getByRole('button', { name: 'Sign out other devices' })).toHaveCount(0)
    for (const p of others) {
      await p.reload()
      await expect(p).toHaveURL(/\/sign-in/)
    }
    await Promise.all(contexts.map((c) => c.close()))
  })

  test('two-step turned off in another tab refuses Make new codes here with an up-to-date page', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInWithPassword(page, { email: members.sales.email, password })
    await openSecurity(page)
    await card(page, 'Sign-in').getByRole('button', { name: 'Turn on' }).click()
    const { secret } = await finishTwoStepSheet(page, password)

    const tab = await page.context().newPage()
    await openSecurity(tab)
    await card(tab, 'Sign-in').getByRole('button', { name: 'Turn off' }).click()
    const off = tab.getByRole('dialog', { name: 'Turn off two-step?' })
    await off.getByLabel('Password', { exact: true }).fill(password)
    await off.getByLabel('6-digit code').fill(nextTotpCode(secret))
    await off.getByRole('button', { name: 'Turn off two-step' }).click()
    await expect(toastWith(tab, 'Two-step is off')).toBeVisible()

    await card(page, 'Sign-in').getByRole('button', { name: 'Make new codes' }).click()
    const dialog = page.getByRole('dialog', { name: 'New backup codes' })
    await dialog.getByLabel('Password', { exact: true }).fill(password)
    await dialog.getByRole('button', { name: 'Make new codes' }).click()

    await expect(dialog.getByText('Two-step is off now. The page is up to date.')).toBeVisible()
  })

  test('a person whose password reset is required cannot sign in with the password either', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    forceReset(members.sales.email)

    await page.goto('/sign-in')
    await enterPassword(page, members.sales.email, password)

    await expect(page.getByRole('alert')).toContainText('Your two-step sign-in was reset')
  })
})
