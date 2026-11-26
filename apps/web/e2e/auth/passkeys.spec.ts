import { expect, type Page, test } from '@playwright/test'
import {
  ageReauth,
  ageSessions,
  createSecurityTeamFixture,
  fillPasskeys,
  forceReset,
  type SecurityTeamFixture,
  sessionExpiry,
} from '../support/fixtures'
import { newestEmail } from '../support/mailbox'
import { card, confirmItsYou, openSecurity, toastWith } from '../support/security'
import {
  enterPassword,
  HOME_GREETING,
  runCommand,
  signInAs,
  signInWithPassword,
} from '../support/sign-in'
import { openTeam, rowMenu } from '../support/team'
import { addVirtualAuthenticator, type VirtualAuthenticator } from '../support/webauthn'

// J-ONB-04 (passkey steps) and J-ONB-09 (add, rename, remove). Chromium's virtual authenticator
// stands in for Face ID: it belongs to one tab, so each test keeps one page from add to sign-in.

test.skip(({ isMobile }) => isMobile, 'The virtual authenticator is driven on the desktop project')

const SIGN_IN_AGAIN = 'Sign in with a passkey'

type Person = SecurityTeamFixture['members'][keyof SecurityTeamFixture['members']]

const passkeyList = (page: Page) =>
  card(page, 'Passkeys').getByRole('list', { name: 'Passkeys' }).getByRole('listitem')

/** Signs in, then adds the virtual Face ID, so the one-time offer after sign-in stays out of the way. */
async function signedInWithAuthenticator(
  page: Page,
  person: Person,
  password: string,
  suggestions = false,
): Promise<VirtualAuthenticator> {
  await signInAs(page, person, password)
  return addVirtualAuthenticator(page, { suggestions })
}

/** Adds a passkey from My security; a sign-in just made counts as confirmed, so no password is asked unless given. */
async function addPasskey(page: Page, password?: string) {
  await openSecurity(page)
  await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).first().click()
  if (password) await confirmItsYou(page, password)
  await expect(toastWith(page, /^Passkey added/)).toBeVisible()
}

async function signOut(page: Page) {
  await runCommand(page, 'Sign out')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
}

/**
 * Opens Sign in and uses the button. With a passkey on the device the virtual authenticator also
 * answers the email field's suggestions at once, so the button may already be gone: either way
 * the passkey path is what runs.
 */
async function startPasskeySignIn(page: Page) {
  await page.goto('/sign-in')
  await page
    .getByRole('button', { name: SIGN_IN_AGAIN })
    .click({ timeout: 3_000 })
    .catch(() => undefined)
}

test.describe('adding, renaming and removing', () => {
  test('adding a passkey asks for the password once, names it from the device and alerts the member', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const authenticator = await signedInWithAuthenticator(page, members.sales, password)
    ageReauth(members.sales.email)
    await openSecurity(page)
    await expect(page.getByText('No passkeys yet.')).toBeVisible()

    await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).click()
    await confirmItsYou(page, password)

    await expect(toastWith(page, /^Passkey added · Passkey · Chrome/)).toBeVisible()
    await expect(passkeyList(page)).toHaveCount(1)
    await expect(passkeyList(page).first()).toContainText('Never used')
    expect(await authenticator.credentials()).toHaveLength(1)
    const mail = await newestEmail(members.sales.email, 'security_alert')
    expect(mail.subject.toLowerCase()).toContain('passkey')
  })

  test('a second try on the same device says it already has one, without asking for the password again', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)

    await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).click()

    await expect(
      toastWith(page, 'This device already has a passkey for your account.'),
    ).toBeVisible()
    await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toHaveCount(0)
    await expect(passkeyList(page)).toHaveCount(1)
  })

  test('the Rename in the toast and the row menu both rename in place, and Esc cancels', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)

    await page.getByRole('button', { name: 'Rename', exact: true }).click()
    const field = page.getByRole('textbox', { name: 'Passkey name' })
    await field.fill('Work laptop')
    await field.press('Enter')
    await expect(passkeyList(page).first()).toContainText('Work laptop')

    await page.getByRole('button', { name: 'Actions for Work laptop' }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Passkey name' }).fill('Not this')
    await page.getByRole('textbox', { name: 'Passkey name' }).press('Escape')
    await expect(passkeyList(page).first()).toContainText('Work laptop')

    await page.getByRole('button', { name: 'Actions for Work laptop' }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Passkey name' }).fill('')
    await page.getByRole('textbox', { name: 'Passkey name' }).press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: /name/i })).toBeVisible()
  })

  test('removing a passkey confirms by name, then that passkey is no longer recognised at sign-in', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await passkeyList(page)
      .first()
      .getByRole('button', { name: /^Actions for / })
      .click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()

    const confirm = page.getByRole('alertdialog', { name: /^Remove / })
    await expect(confirm).toContainText('already signed in')
    await confirm.getByRole('button', { name: 'Remove passkey' }).click()

    await expect(card(page, 'Passkeys').getByText('No passkeys yet.')).toBeVisible()
    await newestEmail(members.sales.email, 'security_alert')
    await signOut(page)
    await startPasskeySignIn(page)
    await expect(page.getByRole('alert')).toContainText("That passkey isn't recognised")
  })

  test('at ten passkeys Add a passkey is replaced by the limit line', async ({ page }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    fillPasskeys(members.sales.email, 9)
    await addPasskey(page)

    await expect(passkeyList(page)).toHaveCount(10)
    await expect(
      card(page, 'Passkeys').getByText(
        'You can have up to 10 passkeys. Remove one you no longer use.',
      ),
    ).toBeVisible()
    await expect(card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' })).toHaveCount(
      0,
    )
  })

  test('a device that fails the Face ID or fingerprint check saves nothing and the page stays usable', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const authenticator = await signedInWithAuthenticator(page, members.sales, password)
    await authenticator.setUserVerified(false)
    ageReauth(members.sales.email)
    await openSecurity(page)

    await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).click()
    await confirmItsYou(page, password)

    // The browser's own prompt never completes, so the app says nothing and saves nothing.
    expect(await authenticator.credentials()).toHaveLength(0)
    await expect(card(page, 'Passkeys').getByText('No passkeys yet.')).toBeVisible()
  })

  test('a passkey that cannot be found without an email is refused', async ({ page }) => {
    const { members, password } = createSecurityTeamFixture()
    await signInAs(page, members.sales, password)
    await addVirtualAuthenticator(page, { hasResidentKey: false })
    ageReauth(members.sales.email)
    await openSecurity(page)

    await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).click()
    await confirmItsYou(page, password)

    await expect(card(page, 'Passkeys').getByText('No passkeys yet.')).toBeVisible()
  })
})

test.describe('the offer after a password sign-in', () => {
  test('is shown once per device, Not now sticks, and it never comes back', async ({ page }) => {
    const { members, password } = createSecurityTeamFixture()
    await addVirtualAuthenticator(page)
    await page.goto('/sign-in')
    await enterPassword(page, members.sales.email, password)

    const offer = page.getByRole('dialog', { name: 'Sign in faster next time' })
    await expect(offer).toBeVisible()
    await offer.getByRole('button', { name: 'Not now' }).click()
    await expect(offer).toBeHidden()

    await signOut(page)
    await enterPassword(page, members.sales.email, password)
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    await expect(offer).toHaveCount(0)
  })

  test('Esc closes the offer as Not now, and it does not return after the next sign-in', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await addVirtualAuthenticator(page)
    await page.goto('/sign-in')
    await enterPassword(page, members.sales.email, password)
    const offer = page.getByRole('dialog', { name: 'Sign in faster next time' })
    await expect(offer).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(offer).toBeHidden()
    await signOut(page)
    await enterPassword(page, members.sales.email, password)
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    await expect(offer).toHaveCount(0)
  })

  test('Add a passkey in the offer skips the password prompt and adds it', async ({ page }) => {
    const { members, password } = createSecurityTeamFixture()
    const authenticator = await addVirtualAuthenticator(page)
    await page.goto('/sign-in')
    await enterPassword(page, members.sales.email, password)

    const offer = page.getByRole('dialog', { name: 'Sign in faster next time' })
    await offer.getByRole('button', { name: 'Add a passkey' }).click()

    await expect(toastWith(page, /^Passkey added/)).toBeVisible()
    await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toHaveCount(0)
    expect(await authenticator.credentials()).toHaveLength(1)
  })
})

test.describe('signing in with a passkey', () => {
  test('the button signs a finance member in with no two-step code and notes the last use', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.finance, password)
    await addPasskey(page)
    await signOut(page)

    await startPasskeySignIn(page)

    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Two-step check' })).toHaveCount(0)
    await openSecurity(page)
    await expect(passkeyList(page).first()).toContainText('Last used today')
  })

  test('the email field offers saved passkeys in its suggestions', async ({ page }) => {
    await page.goto('/sign-in')

    await expect(page.getByLabel('Work email')).toHaveAttribute('autocomplete', 'username webauthn')
  })

  test('the browser picks the passkey from the email field with no button pressed', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password, true)
    await addPasskey(page)
    await signOut(page)
    await page.goto('/sign-in')

    // Conditional UI waits for a pick from the browser's own suggestion list; focusing the
    // field is what the person does. The virtual authenticator answers it without a prompt.
    await page.getByLabel('Work email').click()

    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('Keep me signed in makes the passkey session last 30 days on the server, and leaving it unticked does not', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await signOut(page)
    await startPasskeySignIn(page)
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    const unticked = sessionExpiry(members.sales.email)
    expect(unticked.persistent).toBe(false)
    expect(unticked.days).toBeLessThan(1)
    await signOut(page)

    await page.goto('/sign-in')
    await page.getByLabel(/Keep me signed in/).check()
    await page.getByRole('button', { name: SIGN_IN_AGAIN }).click()
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    const ticked = sessionExpiry(members.sales.email)
    expect(ticked.persistent).toBe(true)
    expect(ticked.days).toBeGreaterThan(25)
  })

  test('an unticked passkey sign-in leaves a browser-session cookie, as a password sign-in does', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await signOut(page)

    await startPasskeySignIn(page)
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

    const cookie = (await page.context().cookies()).find((c) => /session_token/.test(c.name))
    expect(cookie?.expires).toBe(-1)
  })

  test('a device that fails the Face ID check does not sign in, and the password still works', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const authenticator = await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await signOut(page)
    await authenticator.setUserVerified(false)

    await startPasskeySignIn(page)
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toHaveCount(0)
    // Nothing the passkey did counted towards a lock: the password signs in at once.
    await enterPassword(page, members.sales.email, password)

    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  })

  test('a passkey still works while sign-in is locked by wrong passwords', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await signOut(page)
    // Another device (no passkey) types ten wrong passwords: the account is locked.
    const other = await browser.newContext()
    const attacker = await other.newPage()
    await attacker.goto('/sign-in')
    for (let attempt = 1; attempt <= 10; attempt++) {
      await enterPassword(attacker, members.sales.email, `Wrong-password-${attempt}`)
      await expect(attacker.getByRole('alert').first()).toBeVisible()
    }
    await expect(attacker.getByRole('alert')).toContainText(/Too many wrong passwords/)
    await other.close()

    await startPasskeySignIn(page)

    await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  })

  test('is refused while a password reset is required, with the 2a words', async ({ page }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await signOut(page)
    forceReset(members.sales.email)

    await startPasskeySignIn(page)

    await expect(page.getByRole('alert')).toContainText(
      'Your two-step sign-in was reset. Set a new password with the link we emailed you, then sign in.',
    )
  })

  test('an admin resetting two-step removes the passkey, so passkey sign-in fails afterwards', async ({
    page,
    browser,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await signOut(page)

    const adminContext = await browser.newContext()
    const admin = await adminContext.newPage()
    await signInAs(admin, members.owner, password)
    await openTeam(admin)
    await rowMenu(admin, members.sales.name).click()
    await admin.getByRole('menuitem', { name: 'Reset two-step' }).click()
    const confirm = admin.getByRole('alertdialog', {
      name: `Reset ${members.sales.name}'s two-step?`,
    })
    await expect(confirm).toContainText('their 1 passkey will be removed')
    await confirm.getByRole('button', { name: 'Reset two-step' }).click()
    await expect(admin.getByText(`Two-step reset for ${members.sales.name}`)).toBeVisible()
    await adminContext.close()

    await startPasskeySignIn(page)

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('heading', { name: HOME_GREETING })).toHaveCount(0)
  })
})

test.describe('Session expired', () => {
  async function expireSession(page: Page, email: string) {
    ageSessions(email)
    await runCommand(page, 'Sign out everywhere else')
    await expect(page.getByRole('heading', { name: 'Your session has ended' })).toBeVisible()
  }

  test('the same person signs in again with a passkey and the page underneath stays', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    await signedInWithAuthenticator(page, members.sales, password)
    await addPasskey(page)
    await expireSession(page, members.sales.email)

    await page.getByRole('button', { name: SIGN_IN_AGAIN }).click()

    await expect(page.getByRole('heading', { name: 'Your session has ended' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/settings\/security$/)
    await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
  })

  test('a different person signing in with a passkey goes Home with nothing of the first person left', async ({
    page,
  }) => {
    const { members, password } = createSecurityTeamFixture()
    const authenticator = await signedInWithAuthenticator(page, members.viewer, password)
    await addPasskey(page)
    await signOut(page)
    // Only Yusuf's passkey is on this device; Grace signs in with her password.
    expect(await authenticator.credentials()).toHaveLength(1)
    await signInWithPassword(page, { email: members.sales.email, password })
    // This device has Face ID and Grace has no passkey here, so the offer comes first.
    const offer = page.getByRole('dialog', { name: 'Sign in faster next time' })
    await expect(offer).toBeVisible()
    await offer.getByRole('button', { name: 'Not now' }).click()
    await expect(offer).toBeHidden()
    await openSecurity(page)
    await expireSession(page, members.sales.email)

    await page.getByRole('button', { name: SIGN_IN_AGAIN }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Yusuf$/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: /^Account: / }).click()
    await expect(page.getByRole('menu')).toContainText(members.viewer.email)
    await expect(page.getByRole('menu')).not.toContainText(members.sales.email)
  })
})

test('a passkey added right after signing in does not ask for the password again', async ({
  page,
}) => {
  const { members, password } = createSecurityTeamFixture()
  await signedInWithAuthenticator(page, members.sales, password)
  await openSecurity(page)

  await card(page, 'Passkeys').getByRole('button', { name: 'Add a passkey' }).click()

  await expect(toastWith(page, /^Passkey added/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toHaveCount(0)
})
