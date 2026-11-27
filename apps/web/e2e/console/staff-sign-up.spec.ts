import { expect, type Page, test } from '@playwright/test'
import {
  expectNoSeriousViolations,
  expectStaffLabel,
  openStaffInvitation,
  useTheme,
} from '../support/console'
import {
  ageStaffInvitation,
  createCustomerAccount,
  createMemberFixture,
  createStaffInvitation,
  createSuperAdminFixture,
} from '../support/fixtures'
import { saveBackupCodes } from '../support/security'
import { signInWithTotp } from '../support/sign-in'
import { nextTotpCode, totpCode } from '../support/totp'
import { addVirtualAuthenticator } from '../support/webauthn'

// J-ADM-05: a new staff member joins from the invitation email. Separate from customer sign-up:
// name and password, mandatory two-step, backup codes, an optional passkey, then the Dashboard.

const PASSWORD = 'Chika-staff-2026!'
const WRONG_CODE = "That code didn't work. Check the time on your phone and try again."
const JOIN = 'Join the Vento Real Estate console'

type Invitation = Awaited<ReturnType<typeof createStaffInvitation>>

// The cap of 5 open staff invitations is global, so each test expires what it made.
const made: string[] = []
async function makeInvitation(...args: Parameters<typeof createStaffInvitation>) {
  const invitation = await createStaffInvitation(...args)
  made.push(invitation.email)
  return invitation
}
test.afterEach(() => {
  for (const email of made.splice(0)) ageStaffInvitation(email, 49)
})

/** Name and password, then reads the manual-entry key on the two-step step. */
async function setPasswordAndReadKey(page: Page, invitation: Invitation): Promise<string> {
  await openStaffInvitation(page, invitation.link)
  await expect(page.getByRole('heading', { name: JOIN })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible()
  const key = page.getByText(/^([A-Z2-7]{4} ){3,}[A-Z2-7]{1,4}$/)
  await expect(key).toBeVisible()
  return ((await key.textContent()) ?? '').replace(/\s/g, '')
}

/** Verifies the code, saves the backup codes and returns them; stops on "Add a passkey?". */
async function verifyAndSaveCodes(page: Page, secret: string): Promise<string[]> {
  await page.getByLabel('6-digit code').fill(totpCode(secret))
  await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible()
  const codes = await saveBackupCodes(page.locator('body'))
  await page.getByRole('button', { name: "I've saved them" }).click()
  await expect(page.getByRole('heading', { name: 'Add a passkey?' })).toBeVisible()
  return codes
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /^Account: / }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
}

test.describe('joining', () => {
  test('a staff member sets a password and two-step, saves backup codes, skips the passkey and lands on the Dashboard', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    const secret = await setPasswordAndReadKey(page, invitation)
    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible()
    await expect(page.getByText('Staff accounts need it every time you sign in.')).toBeVisible()

    const codes = await verifyAndSaveCodes(page, secret)
    await page.getByRole('button', { name: 'Skip for now' }).click()

    expect(codes).toHaveLength(10)
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(
      page.getByText(/^Welcome, .*\. You're a Vento Real Estate super-admin\.$/),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toHaveCount(0)
    await expectStaffLabel(page)
  })

  test('the first page names who invited them, shows the email read-only and prefills the name', async ({
    page,
  }) => {
    const inviter = await createSuperAdminFixture()
    const invitation = await makeInvitation('pending', inviter.email)

    await openStaffInvitation(page, invitation.link)

    await expect(
      page.getByText(`${invitation.inviterName} invited you as a super-admin.`),
    ).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue(invitation.email)
    await expect(page.getByLabel('Email')).not.toBeEditable()
    await expect(page.getByLabel('Name')).toHaveValue(invitation.name)
  })

  test('a wrong code is refused with the staff message and the right one carries on', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    const secret = await setPasswordAndReadKey(page, invitation)

    await page.getByLabel('6-digit code').fill('000000')

    await expect(page.getByText(WRONG_CODE)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible()
    await page.getByLabel('6-digit code').fill(totpCode(secret))
    await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible()
  })

  test('a password that breaks the rules is refused before anything is made', async ({ page }) => {
    const invitation = await makeInvitation('pending')
    await openStaffInvitation(page, invitation.link)

    await page.getByLabel('Password', { exact: true }).fill('short')
    await page.getByLabel('Confirm password').fill('short')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: JOIN })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toHaveCount(0)
  })

  test('after joining, they sign in with a backup code, and each backup code works once', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    const secret = await setPasswordAndReadKey(page, invitation)
    const codes = await verifyAndSaveCodes(page, secret)
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await signOut(page)

    await page.getByLabel('Work email').fill(invitation.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible()
    await page.getByRole('button', { name: 'Use a backup code' }).click()
    await page.getByLabel('Backup code').fill(codes[0] ?? '')
    await page.getByRole('button', { name: /^(Verify|Sign in|Continue)/ }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })

  test('a new staff member signs in later with a code and reaches the Dashboard', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    const secret = await setPasswordAndReadKey(page, invitation)
    await verifyAndSaveCodes(page, secret)
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await signOut(page)

    await page.getByLabel('Work email').fill(invitation.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    // The sign-up used this window's code; a code works once, so use the next window's.
    await page.getByLabel('6-digit code').fill(nextTotpCode(secret))

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toHaveCount(0)
  })
})

test.describe('adding a passkey (desktop)', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'The virtual authenticator is driven on the desktop project',
  )

  test('Add passkey saves one with the device and goes to the Dashboard', async ({ page }) => {
    const invitation = await makeInvitation('pending')
    const authenticator = await addVirtualAuthenticator(page)
    const secret = await setPasswordAndReadKey(page, invitation)
    await verifyAndSaveCodes(page, secret)

    await page.getByRole('button', { name: 'Add passkey' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    expect(await authenticator.credentials()).toHaveLength(1)
  })

  test('a passkey the person cancels keeps them on the step with Skip for now still there', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    const authenticator = await addVirtualAuthenticator(page, { userVerified: false })
    const secret = await setPasswordAndReadKey(page, invitation)
    await verifyAndSaveCodes(page, secret)
    expect(authenticator.id).toBeTruthy()

    await page.getByRole('button', { name: 'Add passkey' }).click()

    await expect(page.getByRole('heading', { name: 'Add a passkey?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
  })
})

test.describe('leaving half-way', () => {
  test('reopening the link after the password asks for it and resumes at two-step', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    await setPasswordAndReadKey(page, invitation)

    await openStaffInvitation(page, invitation.link)

    await expect(page.getByRole('heading', { name: JOIN })).toBeVisible()
    await expect(page.getByLabel('Name')).toHaveCount(0)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible()
  })

  test('before two-step is verified they are not a super-admin and cannot open the console', async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    await setPasswordAndReadKey(page, invitation)

    await page.goto('/console')

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)
  })

  test('a wrong password on resume is refused and stays on the page', async ({ page }) => {
    const invitation = await makeInvitation('pending')
    await setPasswordAndReadKey(page, invitation)
    await openStaffInvitation(page, invitation.link)

    await page.getByLabel('Password', { exact: true }).fill('Not-the-password-1!')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toHaveCount(0)
  })
})

test.describe('links that cannot be used', () => {
  test('an expired invitation says so and names who to ask', async ({ page }) => {
    const inviter = await createSuperAdminFixture()
    const invitation = await makeInvitation('expired', inviter.email)

    await openStaffInvitation(page, invitation.link)

    await expect(page.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible()
    await expect(page.getByText(`Ask ${invitation.inviterName} to send a new one.`)).toBeVisible()
  })

  test('an invitation that ages past 48 hours expires', async ({ page }) => {
    const invitation = await makeInvitation('pending')
    ageStaffInvitation(invitation.email, 49)

    await openStaffInvitation(page, invitation.link)

    await expect(page.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible()
  })

  test('an unknown link reads as expired', async ({ page }) => {
    await page.goto('/staff-invitation/not-a-real-token-1234567890')

    await expect(page.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible()
  })

  test('a withdrawn invitation says it was withdrawn', async ({ page }) => {
    const invitation = await makeInvitation('withdrawn')

    await openStaffInvitation(page, invitation.link)

    await expect(page.getByRole('heading', { name: 'This invitation was withdrawn' })).toBeVisible()
    await expect(page.getByText(/Ask a Vento Real Estate super-admin/)).toBeVisible()
  })

  test('a used invitation says so and offers Sign in', async ({ page }) => {
    const invitation = await makeInvitation('accepted')

    await openStaffInvitation(page, invitation.link)

    await expect(
      page.getByRole('heading', { name: 'This invitation has already been used' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('an email that got a customer account meanwhile cannot become staff', async ({ page }) => {
    const invitation = await makeInvitation('pending')
    await createCustomerAccount(invitation.email)

    await openStaffInvitation(page, invitation.link)

    await expect(page.getByText(/now has a Vento Real Estate customer account/)).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  })
})

test.describe('signed in as someone else', () => {
  test('the page says who they are signed in as, and Sign out and continue shows the join form', async ({
    page,
  }) => {
    const customer = createMemberFixture()
    const invitation = await makeInvitation('pending')
    await signInWithTotp(page, customer)

    await openStaffInvitation(page, invitation.link)

    await expect(
      page.getByText(
        `You're signed in as ${customer.email}. Sign out to accept this staff invitation.`,
      ),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Sign out and continue' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue(invitation.email)
  })
})

for (const theme of ['light', 'dark'] as const) {
  test(`the staff sign-up steps have no serious accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    const invitation = await makeInvitation('pending')
    await useTheme(page, theme)
    await openStaffInvitation(page, invitation.link)
    await expect(page.getByRole('heading', { name: JOIN })).toBeVisible()
    await expectNoSeriousViolations(page)

    const secret = await setPasswordAndReadKey(page, invitation)
    await expectNoSeriousViolations(page)
    await verifyAndSaveCodes(page, secret)
    await expectNoSeriousViolations(page)
  })
}

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('every sign-up step fits without sideways scrolling', async ({ page }) => {
    const invitation = await makeInvitation('pending')
    const sideways = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    await openStaffInvitation(page, invitation.link)
    expect(await sideways()).toBeLessThanOrEqual(0)

    const secret = await setPasswordAndReadKey(page, invitation)
    expect(await sideways()).toBeLessThanOrEqual(0)
    await verifyAndSaveCodes(page, secret)
    expect(await sideways()).toBeLessThanOrEqual(0)
  })
})
