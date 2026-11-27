import { devices, expect, type Page, test } from '@playwright/test'
import { openInbox, pageFor, requestPane, rolePath } from '../support/approvals'
import { type ApprovalsTeamFixture, createApprovalsTeamFixture } from '../support/fixtures'
import { allEmails, newestEmail } from '../support/mailbox'
import { signInAs } from '../support/sign-in'
import { chooseRole, openInviteSheet, openTeam, pasteEmails, uniqueAddress } from '../support/team'

// J-EXE-02: approve sensitive actions from the inbox. The inbox is a two-pane desktop layout, so
// these run on the desktop project; the phone layout has its own test at the end.

test.describe.configure({ timeout: 120_000 })
test.beforeEach(({ browserName: _ }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the inbox is a two-pane desktop layout')
})

const REQUEST = /Site engineer: Sales & CRM edit removed/
const cell = (page: Page, name: string) => page.getByRole('checkbox', { name })

/** Kunle takes Sales & CRM: Edit off "Site engineer" and sends it with a reason. */
async function askForRoleChange(page: Page, team: ApprovalsTeamFixture, why: string) {
  await page.goto(rolePath(team.role))
  await expect(page.getByRole('heading', { name: team.role.name, level: 1 })).toBeVisible()
  await cell(page, 'Sales & CRM: Edit').click()
  await page.getByRole('button', { name: 'Send for approval' }).click()
  const sheet = page.getByRole('dialog', { name: 'Send for approval' })
  await sheet.getByLabel('Why?').fill(why)
  await sheet.getByRole('button', { name: 'Send for approval' }).click()
}

test.describe('a role change', () => {
  test('is asked for with a reason, approved in two clicks, and then the role changes', async ({
    page,
    browser,
  }, testInfo) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.maker, team.password)

    await page.goto(rolePath(team.role))
    await cell(page, 'Sales & CRM: Edit').click()
    await page.getByRole('button', { name: 'Send for approval' }).click()
    const sheet = page.getByRole('dialog', { name: 'Send for approval' })
    await expect(sheet).toContainText('Site engineer: permissions')
    await expect(sheet).toContainText('Sales & CRM: Edit removed')
    await expect(sheet).toContainText('Nothing changes until it')

    // Why? is required: the message sits on the field and the sheet stays open.
    await sheet.getByRole('button', { name: 'Send for approval' }).click()
    await expect(sheet.getByText('Tell the approver why.')).toBeVisible()
    await sheet.getByLabel('Why?').fill('Halima signs off site POs now')
    await sheet.getByRole('button', { name: 'Send for approval' }).click()

    await expect(page.getByText(/^Sent to .* for approval$/)).toBeVisible()
    await expect(
      page.getByRole('status').filter({ hasText: 'Waiting for approval by' }),
    ).toBeVisible()
    // While it waits the page is read-only: there is nothing to tick, and no second request.
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    const owner = await pageFor(browser, testInfo, team.owner, team.password)
    // Nothing has changed while the request waits.
    await owner.page.goto(rolePath(team.role))
    const salesEdit = owner.page
      .getByRole('row', { name: /^Sales & CRM/ })
      .getByRole('cell')
      .nth(2)
    await expect(salesEdit).toHaveText(/^Allowed/)
    await openInbox(owner.page)
    const pane = requestPane(owner.page)
    await expect(pane.getByRole('heading', { name: REQUEST })).toBeVisible()
    await expect(pane).toContainText('Kunle Ojo')
    await expect(pane).toContainText('Halima signs off site POs now')
    await expect(pane).toContainText('Sales & CRM')

    // The first request is already open: one click approves it.
    await pane.getByRole('button', { name: 'Approve role change' }).click()
    await expect(owner.page.getByText('Approved', { exact: true }).first()).toBeVisible()
    await expect(owner.page.getByText('Nothing waiting for you.')).toBeVisible()

    await owner.page.goto(rolePath(team.role))
    await expect(cell(owner.page, 'Sales & CRM: Edit')).not.toBeChecked()
    // The maker's page is editable again and shows the new permissions.
    await page.reload()
    await expect(cell(page, 'Sales & CRM: Edit')).not.toBeChecked()
    await owner.context.close()
  })

  test('rejected with a comment leaves the role unchanged and the maker sees the comment', async ({
    page,
    browser,
  }, testInfo) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.maker, team.password)
    await askForRoleChange(page, team, 'Halima signs off site POs now')
    await expect(page.getByText(/^Sent to .* for approval$/)).toBeVisible()

    const admin = await pageFor(browser, testInfo, team.admin, team.password)
    await openInbox(admin.page)
    const pane = requestPane(admin.page)
    await expect(pane.getByRole('heading', { name: REQUEST })).toBeVisible()
    // A comment is required to reject.
    await pane.getByRole('button', { name: 'Reject', exact: true }).click()
    await expect(pane.getByText('Enter a comment to reject.')).toBeVisible()
    await pane.getByLabel(/^Comment/).fill('Halima is on leave, ask again next month')
    await pane.getByRole('button', { name: 'Reject', exact: true }).click()
    await expect(admin.page.getByText('Kunle Ojo will see your comment')).toBeVisible()

    await page.goto(rolePath(team.role))
    await expect(cell(page, 'Sales & CRM: Edit')).toBeChecked()
    await openInbox(page, 'mine')
    await expect(
      page.getByRole('link', { name: /Site engineer: Sales & CRM edit removed/ }),
    ).toContainText('Rejected: “Halima is on leave, ask again next month”')
    await admin.context.close()
  })

  test('shows the maker their own request with Cancel instead of buttons, and cancelling clears it', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.maker, team.password)
    await askForRoleChange(page, team, 'Halima signs off site POs now')
    await expect(page.getByText(/^Sent to .* for approval$/)).toBeVisible()

    await openInbox(page, 'mine')
    const pane = requestPane(page)
    await expect(pane.getByText('This is your own request.')).toBeVisible()
    await expect(pane.getByRole('button', { name: 'Approve role change' })).toHaveCount(0)
    await pane.getByRole('button', { name: 'Cancel my request' }).click()

    await expect(page.getByText('Request cancelled')).toBeVisible()
    await expect(page.getByRole('link', { name: REQUEST })).toContainText('Cancelled')
  })

  test('a second request for the same role while one waits is refused with the waiting status', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.maker, team.password)
    await askForRoleChange(page, team, 'Halima signs off site POs now')
    await expect(page.getByText(/^Sent to .* for approval$/)).toBeVisible()

    await page.reload()

    await expect(
      page.getByRole('status').filter({ hasText: 'Waiting for approval by' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send for approval' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'See the request' })).toBeVisible()
  })
})

test.describe('an owner invitation', () => {
  test('waits for approval without any email, then is sent when another owner approves', async ({
    page,
    browser,
  }, testInfo) => {
    const team = createApprovalsTeamFixture()
    const email = uniqueAddress('new.owner')
    await signInAs(page, team.owner, team.password)
    await openTeam(page)

    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, email)
    await chooseRole(sheet, 'Owner')
    await expect(
      sheet.getByText("Owner invitations need approval before they're sent."),
    ).toBeVisible()
    // Why? is required for an owner invitation, and the email isn't sent until it's approved.
    await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await expect(sheet.getByText('Tell the approver why.')).toBeVisible()
    await sheet.getByLabel('Why?').fill('Second owner for the Parkview launch')
    await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()

    await expect(
      page.getByText(`The owner invitation to ${email} waits for approval`),
    ).toBeVisible()
    expect(await allEmails(email)).toHaveLength(0)

    // The maker is an owner too, but cannot decide their own request.
    await openInbox(page, 'mine')
    await expect(requestPane(page).getByText('This is your own request.')).toBeVisible()

    const second = await pageFor(browser, testInfo, team.secondOwner, team.password)
    await openInbox(second.page)
    const pane = requestPane(second.page)
    await expect(pane.getByRole('heading', { name: `Invite ${email} as an owner` })).toBeVisible()
    await expect(pane).toContainText('Second owner for the Parkview launch')
    await pane.getByRole('button', { name: `Invite ${email} as an owner` }).click()
    await expect(second.page.getByText('Approved', { exact: true }).first()).toBeVisible()

    const mail = await newestEmail(email, 'invitation')
    expect(mail.text).toContain('/accept-invitation/')
    await second.context.close()
  })
})

test('on a phone the list and the request are separate pages and approving returns to the list', async ({
  page,
  browser,
}, testInfo) => {
  const team = createApprovalsTeamFixture()
  await signInAs(page, team.maker, team.password)
  await askForRoleChange(page, team, 'Halima signs off site POs now')
  await expect(page.getByText(/^Sent to .* for approval$/)).toBeVisible()

  const context = await browser.newContext({ ...testInfo.project.use, ...devices['Pixel 7'] })
  const phone = await context.newPage()
  await signInAs(phone, team.owner, team.password)
  await openInbox(phone)
  await expect(phone.getByRole('region', { name: 'Request detail' })).toHaveCount(0)
  await phone.getByRole('link', { name: REQUEST }).click()
  await phone.getByRole('button', { name: 'Approve role change' }).click()

  await expect(phone.getByText('Approved', { exact: true }).first()).toBeVisible()
  await expect(phone.getByText('Nothing waiting for you.')).toBeVisible()
  await context.close()
})
