import { expect, type Page, test } from '@playwright/test'
import { openStaffInvitation, signInAsStaff, signInToConsole } from '../support/console'
import {
  ageStaffInvitation,
  createMemberFixture,
  createSuperAdminFixture,
  platformActivity,
} from '../support/fixtures'
import { newestEmail } from '../support/mailbox'
import { enterPassword, signInWithTotp } from '../support/sign-in'
import { openInviteSheet, pasteEmails, uniqueAddress } from '../support/team'
import { totpCode } from '../support/totp'

// J-ADM-03: invite, resend, withdraw, reset two-step and remove super-admins, then read it in
// Activity. Staff join only by invitation (J-ADM-05 is staff-sign-up.spec.ts).

const dialog = (page: Page) => page.getByRole('dialog').first()
const rows = (page: Page) => page.getByTestId('super-admin-row')
const invitationRows = (page: Page) => page.getByTestId('staff-invitation-row')
const PASSWORD = 'Tunde-staff-2026!'

async function openInvite(page: Page) {
  await page.getByRole('button', { name: 'Invite super-admin' }).click()
  await expect(dialog(page).getByLabel('Email')).toBeVisible()
}

async function fillInvite(page: Page, email: string, name: string) {
  await dialog(page).getByLabel('Email').fill(email)
  await dialog(page).getByLabel('Name').fill(name)
  await expect(dialog(page).getByLabel('Name')).toHaveValue(name)
  await dialog(page).getByRole('button', { name: 'Review' }).click()
}

// The cap of 5 open staff invitations is global, so each test expires what it sent.
const sent: string[] = []
test.afterEach(() => {
  for (const email of sent.splice(0)) ageStaffInvitation(email, 49)
})

async function invite(page: Page, email: string, name: string, reason = 'Customer success lead') {
  sent.push(email)
  await openInvite(page)
  await fillInvite(page, email, name)
  await dialog(page).getByLabel('Reason').fill(reason)
  await dialog(page).getByRole('button', { name: 'Send invitation' }).click()
}

async function openRowMenu(page: Page, email: string, item: string) {
  const row = rows(page).filter({ hasText: email })
  await row.getByRole('button', { name: /^Actions for / }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** The invitation link in the email to the invitee, as a path on this web origin. */
async function linkFromMailbox(email: string): Promise<string> {
  const mail = await newestEmail(email)
  const link = mail.text.match(/https?:\/\/\S*\/staff-invitation\/[\w-]+/)?.[0]
  if (!link) throw new Error(`No staff invitation link in the email to ${email}`)
  return link
}

test.describe('the super-admins list', () => {
  test('shows you marked (you) with no actions on your own row', async ({ page }) => {
    const admin = createSuperAdminFixture()
    await signInToConsole(page, admin, '/console/super-admins')

    const you = rows(page).filter({ hasText: admin.email })

    await expect(you).toContainText('(you)')
    await expect(you.getByRole('button', { name: /^Actions for / })).toHaveCount(0)
  })

  test('another super-admin has a menu with Reset two-step and Remove, and the column says Invited by', async ({
    page,
    isMobile,
  }) => {
    const admin = createSuperAdminFixture()
    const other = createSuperAdminFixture()
    await signInToConsole(page, admin, '/console/super-admins')

    await rows(page)
      .filter({ hasText: other.email })
      .getByRole('button', { name: /^Actions for / })
      .click()

    await expect(page.getByRole('menuitem', { name: 'Reset two-step' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Remove' })).toBeVisible()
    await page.keyboard.press('Escape')
    if (!isMobile)
      await expect(page.getByRole('columnheader', { name: 'Invited by' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add super-admin' })).toHaveCount(0)
  })
})

test.describe('inviting', () => {
  test('inviting by email and name previews the invitation, sends it and lists it under Invitations', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    const email = uniqueAddress('tunde')
    await signInToConsole(page, admin, '/console/super-admins')

    sent.push(email)
    await openInvite(page)
    await fillInvite(page, email, 'Tunde Bello')
    await expect(dialog(page)).toContainText(`Tunde Bello (${email}) gets an email to join.`)
    await expect(dialog(page)).toContainText('The link works for 48 hours.')
    await expect(dialog(page)).toContainText(
      'They become a super-admin only after setting a password',
    )
    await dialog(page).getByLabel('Reason').fill('Customer success lead')
    await dialog(page).getByRole('button', { name: 'Send invitation' }).click()

    await expect(page.getByText('Invitation sent to Tunde Bello')).toBeVisible()
    const row = invitationRows(page).filter({ hasText: email })
    await expect(row).toContainText('Tunde Bello')
    await expect(row).toContainText(/Expires \d/)
    const mail = await newestEmail(email)
    expect(mail.subject).toContain('invited you to the Vento Real Estate console')
  })

  test('the ?invite=true address opens the invite sheet', async ({ page }) => {
    await signInToConsole(page, createSuperAdminFixture(), '/console/super-admins?invite=true')

    await expect(dialog(page).getByLabel('Email')).toBeVisible()
  })

  test('an address that is not an email, or a missing name, is refused before anything is checked', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture(), '/console/super-admins')
    await openInvite(page)

    await fillInvite(page, 'not-an-email', '')

    await expect(
      dialog(page).getByText('Enter an email address, like tunde@ventoerp.com'),
    ).toBeVisible()
    await expect(dialog(page).getByText("Enter the person's name")).toBeVisible()
    await expect(dialog(page).getByLabel('Reason')).toHaveCount(0)
  })

  test('an email with a customer account is refused with the message and nothing is sent', async ({
    page,
  }) => {
    const customer = createMemberFixture()
    await signInToConsole(page, createSuperAdminFixture(), '/console/super-admins')
    await openInvite(page)

    await fillInvite(page, customer.email, 'Some Customer')

    await expect(dialog(page).getByRole('alert')).toContainText(
      `${customer.email} already has a Vento Real Estate customer account.`,
    )
    await expect(dialog(page).getByLabel('Reason')).toHaveCount(0)
  })

  test('someone who is already a super-admin is refused', async ({ page }) => {
    const other = createSuperAdminFixture()
    await signInToConsole(page, createSuperAdminFixture(), '/console/super-admins')
    await openInvite(page)

    await fillInvite(page, other.email, 'Already Staff')

    await expect(dialog(page).getByRole('alert')).toContainText('is already a super-admin.')
  })

  test('an email with an open invitation is refused and offers Resend', async ({ page }) => {
    const admin = createSuperAdminFixture()
    const email = uniqueAddress('chika')
    await signInToConsole(page, admin, '/console/super-admins')
    await invite(page, email, 'Chika Obi')
    await expect(invitationRows(page).filter({ hasText: email })).toBeVisible()

    await openInvite(page)
    await fillInvite(page, email, 'Chika Obi')

    await expect(dialog(page).getByRole('alert')).toContainText(
      `${email} already has an invitation that expires`,
    )
    await expect(dialog(page).getByRole('button', { name: 'Resend' })).toBeVisible()
  })
})

test.describe('resending and withdrawing', () => {
  test('Resend is not offered again within a minute, and the row says why on hover', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    const email = uniqueAddress('resend')
    await signInToConsole(page, admin, '/console/super-admins')
    await invite(page, email, 'Resend Person')

    const row = invitationRows(page).filter({ hasText: email })

    await expect(row.getByRole('button', { name: /^Resend/ })).toBeDisabled()
  })

  test('withdrawing asks for a reason, removes the row and the link then says it was withdrawn', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    const email = uniqueAddress('withdraw')
    await signInToConsole(page, admin, '/console/super-admins')
    await invite(page, email, 'Withdrawn Person')
    const link = await linkFromMailbox(email)
    const row = invitationRows(page).filter({ hasText: email })
    await row.getByRole('button', { name: /^Withdraw/ }).click()
    await expect(dialog(page)).toContainText("Withdraw Withdrawn Person's invitation?")

    await dialog(page).getByLabel('Reason').fill('Changed our minds')
    await dialog(page).getByRole('button', { name: 'Withdraw invitation' }).click()

    await expect(row).toHaveCount(0)
    await openStaffInvitation(page, link)
    await expect(page.getByRole('heading', { name: 'This invitation was withdrawn' })).toBeVisible()
  })

  test('the invitee joins from the emailed link and then appears in the list, not under Invitations', async ({
    page,
    browser,
  }) => {
    const admin = createSuperAdminFixture()
    const email = uniqueAddress('joiner')
    await signInToConsole(page, admin, '/console/super-admins')
    await invite(page, email, 'Joiner Person')
    const link = await linkFromMailbox(email)

    const other = await browser.newContext()
    const joinPage = await other.newPage()
    await openStaffInvitation(joinPage, link)
    await joinPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await joinPage.getByLabel('Confirm password').fill(PASSWORD)
    await joinPage.getByRole('button', { name: 'Continue' }).click()
    const key = joinPage.getByText(/^([A-Z2-7]{4} ){3,}[A-Z2-7]{1,4}$/)
    await expect(key).toBeVisible()
    const secret = ((await key.textContent()) ?? '').replace(/\s/g, '')
    await joinPage.getByLabel('6-digit code').fill(totpCode(secret))
    await expect(joinPage.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible()
    await other.close()

    await page.reload()
    await expect(rows(page).filter({ hasText: email })).toBeVisible()
    await expect(invitationRows(page).filter({ hasText: email })).toHaveCount(0)
  })
})

test.describe('removing and resetting', () => {
  test('removing another super-admin closes their account: the list drops them and they cannot sign in', async ({
    page,
    browser,
  }) => {
    const admin = createSuperAdminFixture()
    const other = createSuperAdminFixture()
    await signInToConsole(page, admin, '/console/super-admins')
    const theirs = await browser.newContext()
    const theirPage = await theirs.newPage()
    await signInAsStaff(theirPage, other)

    await openRowMenu(page, other.email, 'Remove')
    await expect(dialog(page)).toContainText(/Remove .* as a super-admin\?/)
    await dialog(page).getByLabel('Reason').fill('Left the team')
    await dialog(page)
      .getByRole('button', { name: /^Remove / })
      .click()

    await expect(rows(page).filter({ hasText: other.email })).toHaveCount(0)
    await theirPage.goto('/console/releases')
    await expect(theirPage.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    await theirPage.goto('/sign-in')
    await enterPassword(theirPage, other.email, other.password)
    await expect(theirPage.getByRole('alert').first()).toBeVisible()
    await expect(theirPage.getByRole('heading', { name: 'Two-step check' })).toHaveCount(0)
    await theirs.close()
  })

  test('Reset two-step signs them out, emails them and asks for a new password and two-step', async ({
    page,
    browser,
  }) => {
    const admin = createSuperAdminFixture()
    const other = createSuperAdminFixture()
    await signInToConsole(page, admin, '/console/super-admins')
    const theirs = await browser.newContext()
    const theirPage = await theirs.newPage()
    await signInAsStaff(theirPage, other)

    await openRowMenu(page, other.email, 'Reset two-step')
    await expect(dialog(page)).toContainText(/Reset .*'s two-step\?/)
    await dialog(page).getByLabel('Reason').fill('Lost phone')
    await dialog(page).getByRole('button', { name: 'Reset two-step' }).click()

    await expect(page.getByText(/two-step was reset/)).toBeVisible()
    await expect(rows(page).filter({ hasText: other.email })).toBeVisible()
    const mail = await newestEmail(other.email, 'reset_password')
    expect(mail.subject).toContain('Vento Real Estate')
    await theirPage.goto('/console/releases')
    await expect(theirPage.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    await theirs.close()
  })
})

test.describe('activity', () => {
  test('shows the invitation and its withdrawal by that person, tagged Console, with their reasons', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    const email = uniqueAddress('trail')
    await signInToConsole(page, admin, '/console/super-admins')
    await invite(page, email, 'Trail Person', 'Customer success hire')
    const row = invitationRows(page).filter({ hasText: email })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /^Withdraw/ }).click()
    await dialog(page).getByLabel('Reason').fill('Left the team')
    await dialog(page).getByRole('button', { name: 'Withdraw invitation' }).click()
    await expect(row).toHaveCount(0)

    await page.goto(`/console/activity?person=${admin.userId}`)

    const feed = page.getByRole('list', { name: 'Changes, newest first' })
    await expect(feed.getByText('“Customer success hire”')).toBeVisible()
    await expect(feed.getByText('“Left the team”')).toBeVisible()
    await expect(feed.getByText(/Invited Trail Person/)).toBeVisible()
  })

  test('a break-glass change from the command line shows the rose Command line tag', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    platformActivity(admin.email)
    await signInToConsole(page, admin, `/console/activity?person=${admin.userId}`)

    const feed = page.getByRole('list', { name: 'Changes, newest first' })

    await expect(feed.getByText('Command line', { exact: true })).toBeVisible()
    await expect(feed.getByText('“e2e break-glass fixture”')).toBeVisible()
  })

  test('filtering by a person and a kind they have not changed says no changes match and Clear filters resets it', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture()
    await signInToConsole(page, admin, `/console/activity?person=${admin.userId}&kind=override`)

    await expect(page.getByText('No changes match these filters.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()

    await expect(page.getByText('No changes match these filters.')).toHaveCount(0)
    await expect(page).not.toHaveURL(/person=/)
  })
})

test.describe('customers cannot invite staff addresses', () => {
  test('an owner who types a staff email in Invite people gets the neutral cannot-be-invited problem', async ({
    page,
  }) => {
    const staff = createSuperAdminFixture()
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    await page.goto('/settings/team')
    const sheet = await openInviteSheet(page)

    await pasteEmails(sheet, staff.email)
    await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()

    await expect(
      sheet.getByRole('alert').getByText("This email can't be invited. Use a different email."),
    ).toBeVisible()
  })
})
