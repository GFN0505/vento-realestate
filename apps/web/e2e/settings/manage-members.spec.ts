import { expect, type Page } from '@playwright/test'
import {
  createScopedTeamFixture,
  createTeamFixture,
  createTeamInvitation,
  setRole,
  type TeamFixture,
} from '../support/fixtures'
import { allEmails, invitationPath, newestEmail } from '../support/mailbox'
import { test as shared } from '../support/shell'
import { enterPassword, signInAs, signInWithPassword } from '../support/sign-in'
import { openTeam, personRow, rowMenu, uniqueAddress } from '../support/team'

// J-ONB-06: change access, reset two-step, remove a leaver. Phones list cards and keep actions in
// the sheet, so the row-menu flows run on the desktop project; the phone layout is covered in
// invite-members.spec.ts and accessibility.spec.ts.

const test = shared
// Creating these teams signs several people up for two-step, which is slow under load.
test.describe.configure({ timeout: 90_000 })
test.beforeEach(({ browserName: _ }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'row menus are a desktop layout')
})

type Person = { email: string; name: string; totpSecret?: string }

/** A team of its own (these tests change data), with the owner signed in on Team. */
async function ownerOnTeam(page: Page): Promise<TeamFixture & { owner: Person }> {
  const team = await createTeamFixture()
  const owner = team.members.owner
  if (!owner) throw new Error('no owner')
  await signInAs(page, owner, team.password)
  await openTeam(page)
  return { ...team, owner }
}

const member = (team: TeamFixture, role: string): Person => {
  const person = team.members[role]
  if (!person) throw new Error(`no ${role}`)
  return person
}

test.describe('role and access', () => {
  test('changing a role from the row saves at once, shows Undo, and Undo restores it', async ({
    page,
  }) => {
    const team = await ownerOnTeam(page)
    const grace = personRow(page, 'Grace Umeh')

    await grace.getByRole('button', { name: /^Role for Grace Umeh: Sales/ }).click()
    await page.getByRole('menuitemradio', { name: 'Finance' }).click()

    await expect(page.getByText('Grace Umeh is now Finance')).toBeVisible()
    await expect(grace).toContainText('Finance')
    // Finance needs two-step and Grace has none yet.
    await expect(grace).toContainText('Set up at next sign-in')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(grace.getByRole('button', { name: /^Role for Grace Umeh: Sales/ })).toBeVisible()
    await expect(grace).toContainText('Off')
    expect(team.organizationId).toBeTruthy()
  })

  test("a role change shows on the member's next request without signing in again", async ({
    page,
    browser,
  }) => {
    const team = await ownerOnTeam(page)
    const grace = member(team, 'sales')
    const context = await browser.newContext()
    const tab = await context.newPage()
    await signInAs(tab, grace, team.password)
    await expect(tab.getByRole('link', { name: 'Finance' }).first()).toHaveCount(0)

    await personRow(page, 'Grace Umeh')
      .getByRole('button', { name: /^Role for Grace Umeh/ })
      .click()
    await page.getByRole('menuitemradio', { name: 'Viewer' }).click()
    await expect(page.getByText('Grace Umeh is now Viewer')).toBeVisible()

    await tab.reload()
    await expect(
      tab.getByRole('heading', { name: /^Good (morning|afternoon|evening), / }),
    ).toBeVisible()
    await expect(tab.getByText('Viewer').first()).toBeVisible()
    await context.close()
  })

  test('entity access is changed in the member sheet: Save is disabled until something differs and one entity is required', async ({
    page,
  }) => {
    const team = await ownerOnTeam(page)
    await personRow(page, 'Grace Umeh')
      .getByRole('button', { name: 'Grace Umeh', exact: true })
      .click()
    const sheet = page.getByRole('dialog', { name: 'Grace Umeh' })
    const save = sheet.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()

    await sheet.getByRole('radio', { name: 'Only some companies' }).check()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(sheet.getByText('Choose at least one company, or allow all')).toBeVisible()

    await sheet.getByRole('checkbox', { name: team.entities.parkview.name }).check()
    await save.click()

    await expect(page.getByText('Access updated for Grace Umeh')).toBeVisible()
    await expect(sheet).toBeHidden()
    await expect(personRow(page, 'Grace Umeh')).toContainText(team.entities.parkview.name)
  })

  test('making someone an owner asks first, then emails every owner', async ({ page }) => {
    const team = await createTeamFixture()
    const olumide = member(team, 'owner')
    const ngozi = member(team, 'admin')
    const grace = member(team, 'sales')
    // A second owner, so the alert has more than one reader.
    setRole(ngozi.email, 'owner')
    await signInAs(page, olumide, team.password)
    await openTeam(page)

    await personRow(page, 'Grace Umeh')
      .getByRole('button', { name: /^Role for Grace Umeh/ })
      .click()
    await page.getByRole('menuitemradio', { name: 'Owner' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Make Grace Umeh an owner?' })
    await expect(confirm).toContainText('Owners can do everything')
    await confirm.getByRole('button', { name: 'Make owner' }).click()

    await expect(personRow(page, 'Grace Umeh')).toContainText('Owner')
    const subject = `Vento: Grace Umeh is now an owner of ${team.organizationName}`
    for (const owner of [olumide, ngozi, grace]) {
      await expect
        .poll(async () => (await allEmails(owner.email)).map((m) => m.subject))
        .toContain(subject)
    }
  })

  test('cancelling the make owner confirm leaves the role as it was', async ({ page }) => {
    await ownerOnTeam(page)
    await personRow(page, 'Grace Umeh')
      .getByRole('button', { name: /^Role for Grace Umeh/ })
      .click()
    await page.getByRole('menuitemradio', { name: 'Owner' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()

    await expect(personRow(page, 'Grace Umeh')).toContainText('Sales')
    await expect(page.getByText('Grace Umeh is now')).toHaveCount(0)
  })
})

test.describe('invitations', () => {
  test('resending twice within a minute is refused the second time', async ({ page }) => {
    const team = await ownerOnTeam(page)
    const invited = createTeamInvitation(team.organizationId, 'pending', uniqueAddress('resend'))
    await openTeam(page)

    await rowMenu(page, invited.email).click()
    await page.getByRole('menuitem', { name: 'Resend' }).click()
    await expect(page.getByText(`Invitation sent again to ${invited.email}`)).toBeVisible()

    await rowMenu(page, invited.email).click()
    await page.getByRole('menuitem', { name: 'Resend' }).click()
    await expect(
      page.getByText('We sent it less than a minute ago. Try again shortly.'),
    ).toBeVisible()
  })

  test('withdrawing runs at once and the link then says it was withdrawn', async ({ page }) => {
    const team = await ownerOnTeam(page)
    const invited = createTeamInvitation(team.organizationId, 'pending', uniqueAddress('withdraw'))
    await openTeam(page)
    // Resend first, so a mailed link exists to open afterwards.
    await rowMenu(page, invited.email).click()
    await page.getByRole('menuitem', { name: 'Resend' }).click()
    await expect(page.getByText(`Invitation sent again to ${invited.email}`)).toBeVisible()
    const link = invitationPath(await newestEmail(invited.email, 'invitation'))

    await rowMenu(page, invited.email).click()
    await page.getByRole('menuitem', { name: 'Withdraw' }).click()

    await expect(page.getByText(`Invitation to ${invited.email} withdrawn`)).toBeVisible()
    await expect(personRow(page, invited.email)).toHaveCount(0)
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'This invitation was withdrawn' })).toBeVisible()
  })

  test('bounced, failed and expired invitations are flagged with what to do', async ({ page }) => {
    const team = await ownerOnTeam(page)
    const bounced = createTeamInvitation(team.organizationId, 'bounced', uniqueAddress('bounce'))
    const failed = createTeamInvitation(team.organizationId, 'failed', uniqueAddress('failed'))
    const expired = createTeamInvitation(team.organizationId, 'expired', uniqueAddress('expired'))
    await openTeam(page, '?show=invited')

    await expect(personRow(page, bounced.email)).toContainText('Email not delivered')
    await expect(personRow(page, failed.email)).toContainText('Email not delivered')
    await expect(personRow(page, expired.email)).toContainText(/Expired \d+ \w+/)
    await personRow(page, bounced.email)
      .getByRole('button', { name: bounced.email, exact: true })
      .click()
    await expect(
      page.getByRole('dialog').getByText('The address bounced. Check it and invite again.'),
    ).toBeVisible()
  })
})

test.describe('withdraw undo and the entity filter', () => {
  test('Undo after withdrawing invites the person again', async ({ page }) => {
    const team = await ownerOnTeam(page)
    const invited = createTeamInvitation(team.organizationId, 'pending', uniqueAddress('undo'))
    await openTeam(page)

    await rowMenu(page, invited.email).click()
    await page.getByRole('menuitem', { name: 'Withdraw' }).click()
    await expect(personRow(page, invited.email)).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()

    await expect(
      page.getByText(`Invitation to ${invited.email} restored and sent again`),
    ).toBeVisible()
    await expect(personRow(page, invited.email)).toBeVisible()
  })

  test('with an entity picked, Team lists only people who can work in it until Show all entities', async ({
    page,
  }) => {
    const team = await createScopedTeamFixture()
    await signInAs(page, team.members.owner, team.password)
    await openTeam(page, `?entity=${team.entities.lekki.id}`)

    await expect(page.getByText(`People who can work in ${team.entities.lekki.name}`)).toBeVisible()
    await expect(personRow(page, 'Tayo Adeleke')).toBeVisible()
    // Kunle works in Parkview only.
    await expect(personRow(page, 'Kunle Balogun')).toHaveCount(0)

    await page.getByRole('button', { name: 'Show all companies' }).click()
    await expect(personRow(page, 'Kunle Balogun')).toBeVisible()
  })

  test('opening the invite sheet with an entity picked preselects only that entity', async ({
    page,
  }) => {
    const team = await createScopedTeamFixture()
    await signInAs(page, team.members.owner, team.password)
    await openTeam(page, `?entity=${team.entities.parkview.id}`)

    await page.getByRole('button', { name: 'Invite people' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Invite people' })
    await expect(sheet.getByText(team.entities.parkview.name, { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: /^Change company access/ }).click()

    await expect(sheet.getByRole('radio', { name: 'Only some companies' })).toBeChecked()
    await expect(sheet.getByRole('checkbox', { name: team.entities.parkview.name })).toBeChecked()
    await expect(sheet.getByRole('checkbox', { name: team.entities.lekki.name })).not.toBeChecked()
  })
})

test.describe('reset two-step and removal', () => {
  test('resetting two-step explains first, emails an alert and a reset link, and forces a new password', async ({
    page,
    browser,
  }) => {
    const team = await ownerOnTeam(page)
    const aisha = member(team, 'finance')

    await rowMenu(page, 'Aisha Bello').click()
    await page.getByRole('menuitem', { name: 'Reset two-step' }).click()
    const confirm = page.getByRole('alertdialog', { name: "Reset Aisha Bello's two-step?" })
    await expect(confirm).toContainText('This applies in every organization they belong to.')
    await confirm.getByRole('button', { name: 'Reset two-step' }).click()

    await expect(page.getByText("Two-step reset for Aisha Bello. We've emailed them")).toBeVisible()
    await expect(personRow(page, 'Aisha Bello')).toContainText('Reset, waiting for new password')
    await newestEmail(aisha.email, 'security_alert')
    const reset = await newestEmail(aisha.email, 'reset_password')

    const context = await browser.newContext()
    const tab = await context.newPage()
    await tab.goto('/sign-in')
    await enterPassword(tab, aisha.email, team.password)
    await expect(tab.getByText('Set a new password with the link we emailed you')).toBeVisible()
    const url = new URL(reset.text.match(/https?:\/\/\S+/)?.[0] ?? '')
    await tab.goto(`${url.pathname}${url.search}`)
    await tab.getByLabel('New password', { exact: true }).fill('Lagos-lagoon-2027')
    await tab.getByLabel('Confirm password').fill('Lagos-lagoon-2027')
    await tab.getByRole('button', { name: 'Save and sign in' }).click()
    await enterPassword(tab, aisha.email, 'Lagos-lagoon-2027')
    // Two-step was cleared, so Finance must set it up again before anything else.
    await expect(tab).toHaveURL(/\/two-step\/setup/)
    await context.close()
  })

  test('Reset two-step is offered only to people who have two-step on', async ({ page }) => {
    await ownerOnTeam(page)

    await rowMenu(page, 'Grace Umeh').click()
    await expect(page.getByRole('menuitem', { name: 'Change access' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Reset two-step' })).toHaveCount(0)
  })

  test('removing a leaver confirms by name, moves them to Removed, and ends their session', async ({
    page,
    browser,
  }) => {
    const team = await ownerOnTeam(page)
    const grace = member(team, 'sales')
    const context = await browser.newContext()
    const tab = await context.newPage()
    await signInWithPassword(tab, { email: grace.email, password: team.password })

    await rowMenu(page, 'Grace Umeh').click()
    await page.getByRole('menuitem', { name: /^Remove from / }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Remove Grace Umeh?' })
    await expect(confirm).toContainText('You can invite them again later.')
    await confirm.getByRole('button', { name: 'Remove Grace Umeh' }).click()

    await expect(page.getByText('Grace Umeh removed. History kept.')).toBeVisible()
    await expect(personRow(page, 'Grace Umeh')).toHaveCount(0)
    await page.getByRole('button', { name: /^Removed/ }).click()
    await expect(page.getByText(/Removed \d+ \w+ \d{4} by Olumide Bankole/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite Grace Umeh again' })).toBeVisible()

    // Her next request is refused: she is signed out of this organization.
    await tab.reload()
    await expect(
      tab.getByRole('heading', { name: /^Good (morning|afternoon|evening), / }),
    ).toHaveCount(0)
    await context.close()
  })

  test('Invite again from Removed opens the invite sheet with the email filled in', async ({
    page,
  }) => {
    const team = await ownerOnTeam(page)
    const grace = member(team, 'sales')
    await rowMenu(page, 'Grace Umeh').click()
    await page.getByRole('menuitem', { name: /^Remove from / }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove Grace Umeh' }).click()
    await expect(page.getByText('Grace Umeh removed. History kept.')).toBeVisible()

    await page.getByRole('button', { name: /^Removed/ }).click()
    await page.getByRole('button', { name: 'Invite Grace Umeh again' }).click()

    const sheet = page.getByRole('dialog', { name: 'Invite people' })
    await expect(sheet.getByText(grace.email, { exact: true })).toBeVisible()
    await expect(sheet.getByRole('combobox', { name: 'Role', exact: true })).toContainText('Sales')
  })
})

test.describe('what each viewer may change', () => {
  test('your own row has no role or actions menu and its sheet says why', async ({ as }) => {
    const page = await as('owner')
    await openTeam(page)

    const own = personRow(page, 'Olumide Bankole')
    await expect(own).toContainText('You')
    await expect(rowMenu(page, 'Olumide Bankole')).toHaveCount(0)
    await expect(own.getByRole('button', { name: /^Role for/ })).toHaveCount(0)
    await own.getByRole('button', { name: 'Olumide Bankole', exact: true }).click()
    await expect(
      page.getByText('This is you. Ask another owner or admin to change your access.'),
    ).toBeVisible()
  })

  test('an admin cannot change an owner and is not offered Owner for anyone else', async ({
    as,
  }) => {
    const page = await as('admin')
    await openTeam(page)

    await expect(rowMenu(page, 'Olumide Bankole')).toHaveCount(0)
    await personRow(page, 'Olumide Bankole')
      .getByRole('button', { name: 'Olumide Bankole', exact: true })
      .click()
    await expect(page.getByText("Only owners can change an owner's access.")).toBeVisible()
    await page.keyboard.press('Escape')

    await personRow(page, 'Grace Umeh')
      .getByRole('button', { name: /^Role for Grace Umeh/ })
      .click()
    await expect(page.getByRole('menuitemradio', { name: 'Finance' })).toBeVisible()
    await expect(page.getByRole('menuitemradio', { name: 'Owner' })).toHaveCount(0)
  })

  test('an admin limited to Parkview sees only Parkview names and cannot manage wider access', async ({
    page,
  }) => {
    const team = await createScopedTeamFixture()
    const admin = team.members.limitedAdmin
    await signInAs(page, admin, team.password)
    await openTeam(page)

    // Within reach: Kunle is Parkview only.
    await expect(rowMenu(page, 'Kunle Balogun')).toBeVisible()
    // Beyond reach: Tayo has Parkview and Lekki; Grace and Aisha have every entity.
    const tayo = personRow(page, 'Tayo Adeleke')
    await expect(tayo).toContainText(`${team.entities.parkview.name} and 1 other`)
    await expect(rowMenu(page, 'Tayo Adeleke')).toHaveCount(0)
    await expect(tayo.getByRole('button', { name: /^Role for/ })).toHaveCount(0)
    await expect(rowMenu(page, 'Aisha Bello')).toHaveCount(0)
    await expect(page.getByText(team.entities.lekki.name)).toHaveCount(0)

    await tayo.getByRole('button', { name: 'Tayo Adeleke', exact: true }).click()
    await expect(
      page.getByText(
        "Tayo Adeleke has access to companies you can't see. Ask Olumide Bankole (owner) to change it.",
      ),
    ).toBeVisible()
  })

  test('an admin limited to Parkview can only give Parkview in the invite sheet', async ({
    page,
  }) => {
    const team = await createScopedTeamFixture()
    await signInAs(page, team.members.limitedAdmin, team.password)
    await openTeam(page)

    await page.getByRole('button', { name: 'Invite people' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Invite people' })

    await expect(sheet.getByText(team.entities.parkview.name, { exact: true })).toBeVisible()
    await expect(sheet.getByText('All companies')).toHaveCount(0)
    await expect(sheet.getByText(team.entities.lekki.name)).toHaveCount(0)
  })
})

test.describe('keyboard', () => {
  test('i opens Invite people, / focuses search, and Esc on a row sheet returns focus to the row', async ({
    as,
  }) => {
    const page = await as('owner')
    await openTeam(page)

    await page.keyboard.press('/')
    await expect(page.getByRole('searchbox', { name: 'Search by name or email' })).toBeFocused()
    await page.getByRole('heading', { name: 'Team', level: 1 }).click()
    await page.keyboard.press('i')
    await expect(page.getByRole('dialog', { name: 'Invite people' })).toBeVisible()
    await page.keyboard.press('Escape')

    const name = personRow(page, 'Grace Umeh').getByRole('button', {
      name: 'Grace Umeh',
      exact: true,
    })
    await name.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Grace Umeh' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(name).toBeFocused()
  })
})
