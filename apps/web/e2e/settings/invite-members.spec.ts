import { expect, test } from '@playwright/test'
import { createMemberFixture, createTeamFixture, createTeamInvitation } from '../support/fixtures'
import { invitationPath, newestEmail } from '../support/mailbox'
import { HOME_GREETING, signInAs, signInWithTotp } from '../support/sign-in'
import { chooseRole, openInviteSheet, openTeam, pasteEmails, uniqueAddress } from '../support/team'

// J-ONB-02: invite the team from the Team page, then the invitee joins.

test.describe('invite people', () => {
  test('an owner pastes a list with a duplicate and a typo, sends five invitations, and they appear first', async ({
    page,
  }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const [a, b, c, d] = [1, 2, 3, 4].map((n) => uniqueAddress(`invitee${n}`))
    const typo = uniqueAddress('grace').replace('@example.com', '@gmial.com')
    const fixed = typo.replace('@gmial.com', '@gmail.com')
    if (!a || !b || !c || !d) throw new Error('addresses')

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, [a, b, c, a, typo, d].join('\n'))

    await expect(sheet.getByText('Removed 1 duplicate')).toBeVisible()
    await sheet.getByRole('button', { name: `Did you mean ${fixed}?` }).click()
    await expect(sheet.getByText(fixed, { exact: true })).toBeVisible()
    await expect(
      sheet.getByRole('list', { name: 'People to invite' }).getByRole('listitem'),
    ).toHaveCount(5)

    await chooseRole(sheet, 'Sales')
    await sheet.getByRole('button', { name: 'Send 5 invitations' }).click()

    await expect(page.getByText('Invitations sent to 5 people')).toBeVisible()
    await expect(sheet).toBeHidden()
    for (const email of [a, b, c, d, fixed]) {
      await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByText('5 invited', { exact: false }).first()).toBeVisible()
    // Owners come first now, so the five are checked under the Invited chip.
    await page.getByRole('button', { name: /^Invited/ }).click()
    for (const email of [a, b, c, d, fixed]) {
      await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByText(owner.email, { exact: true })).toHaveCount(0)
  })

  test('every invitation lands in the mailbox from the organization via Vento, replying to the inviter', async ({
    page,
  }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const [a, b] = [uniqueAddress('mail1'), uniqueAddress('mail2')]

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, `${a}, ${b}`)
    await chooseRole(sheet, 'Finance')
    await sheet.getByRole('button', { name: 'Send 2 invitations' }).click()
    await expect(page.getByText('Invitations sent to 2 people')).toBeVisible()

    for (const email of [a, b]) {
      const mail = await newestEmail(email, 'invitation')
      expect(mail.subject).toContain(`to ${owner.organizationName} on Vento Real Estate`)
      expect(mail.fromName).toBe(`${owner.organizationName} via Vento Real Estate`)
      expect(mail.replyTo?.email).toBe(owner.email)
      expect(invitationPath(mail)).toMatch(/^\/accept-invitation\//)
    }
  })

  test('an invitee accepts and the owner sees them as a member who was active today', async ({
    page,
    browser,
  }, testInfo) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const email = uniqueAddress('chidi')
    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, email)
    await chooseRole(sheet, 'Sales')
    await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible()

    const invitee = await browser.newContext()
    const tab = await invitee.newPage()
    await tab.goto(invitationPath(await newestEmail(email, 'invitation')))
    await tab.getByLabel('Your name').fill('Chidi Eze')
    await tab.getByLabel('Create a password').fill('Gate-keeper-2026')
    await tab.getByLabel('Confirm password').fill('Gate-keeper-2026')
    await tab.getByRole('button', { name: 'Accept invitation' }).click()
    await expect(tab.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    await invitee.close()

    await openTeam(page)
    const row = page.getByRole('row').filter({ hasText: 'Chidi Eze' })
    // Phones list cards instead of rows; the name and "Today" read the same there.
    if (testInfo.project.name === 'desktop') {
      await expect(row).toContainText('Sales')
      await expect(row).toContainText('Today')
    }
    await expect(page.getByText('Chidi Eze').first()).toBeVisible()
  })
})

test('the success toast offers View invited, which opens the Invited list', async ({ page }) => {
  const owner = createMemberFixture()
  await signInWithTotp(page, owner)
  const email = uniqueAddress('view')
  await openTeam(page)
  const sheet = await openInviteSheet(page)
  await pasteEmails(sheet, email)
  await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()

  await page.getByRole('button', { name: 'View invited' }).click()

  await expect(page).toHaveURL(/show=invited/)
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
})

test.describe('invite problems are marked on the rows', () => {
  test('every member and invited row is marked at once, nothing is sent, and Resend instead works', async ({
    page,
  }) => {
    const team = await createTeamFixture()
    const owner = team.members.owner
    if (!owner) throw new Error('no owner')
    const grace = team.members.sales
    if (!grace) throw new Error('no sales member')
    const pending = createTeamInvitation(team.organizationId, 'pending', uniqueAddress('pending'))
    const fresh = uniqueAddress('fresh')
    await signInAs(page, owner, team.password)

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, [grace.email, pending.email, fresh].join('\n'))
    await chooseRole(sheet, 'Sales')
    await sheet.getByRole('button', { name: 'Send 3 invitations' }).click()

    const rows = sheet.getByRole('list', { name: 'People to invite' })
    await expect(rows.getByRole('listitem').filter({ hasText: grace.email })).toContainText(
      'Already a member',
    )
    await expect(rows.getByRole('listitem').filter({ hasText: pending.email })).toContainText(
      'Already invited',
    )
    await expect(rows.getByRole('listitem').filter({ hasText: fresh })).not.toContainText('Already')
    await expect(page.getByText('Invitations sent to')).toHaveCount(0)

    await rows.getByRole('button', { name: 'Resend instead' }).click()
    await expect(page.getByText(`Invitation sent again to ${pending.email}`)).toBeVisible()
    await expect(rows.getByText(pending.email)).toHaveCount(0)
    // The rest stay for the person to fix.
    await expect(rows.getByRole('listitem').filter({ hasText: grace.email })).toBeVisible()
  })

  test('the viewer\'s own email says "That\'s you", is not counted, and Send is off until it is removed', async ({
    page,
  }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, owner.email)

    await expect(sheet.getByText("That's you")).toBeVisible()
    await expect(sheet.getByText('Fix or remove the marked email to send.')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Send invitation', exact: true })).toBeDisabled()
  })

  test('a made-up address is marked and skipped while the good one still goes', async ({
    page,
  }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const good = uniqueAddress('ok')

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, `not-an-email.com ${good}`)

    await expect(sheet.getByText('Check this email')).toBeVisible()
    await expect(sheet.getByText("1 marked email won't be sent.")).toBeVisible()
    await sheet.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await expect(page.getByText(`Invitation sent to ${good}`)).toBeVisible()
    // The marked row stays in the sheet to fix or remove.
    await expect(sheet.getByText('not-an-email.com')).toBeVisible()
  })

  test('a role is already chosen, so sending needs no extra click', async ({ page }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, uniqueAddress('default'))

    await expect(sheet.getByRole('combobox', { name: 'Role', exact: true })).not.toContainText(
      'Choose a role',
    )
    await expect(sheet.getByRole('button', { name: 'Send invitation', exact: true })).toBeEnabled()
  })

  test('pasting 25 addresses keeps 20 and leaves five in the box', async ({ page }) => {
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)
    const list = Array.from({ length: 25 }, (_, i) => uniqueAddress(`bulk${i}`))

    await openTeam(page)
    const sheet = await openInviteSheet(page)
    await pasteEmails(sheet, list.join('\n'))

    await expect(
      sheet.getByText('You can invite 20 people at a time. Send these, then invite the rest.'),
    ).toBeVisible()
    await expect(
      sheet.getByRole('list', { name: 'People to invite' }).getByRole('listitem'),
    ).toHaveCount(20)
    await expect(sheet.getByLabel('Emails')).toHaveValue(list.slice(20).join('\n'))
  })
})

test.describe('phones', () => {
  test('the Invite people button is sticky and Send stays visible with the sheet open', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only')
    const owner = createMemberFixture()
    await signInWithTotp(page, owner)

    await openTeam(page)
    const invite = page.getByRole('button', { name: 'Invite people' }).first()
    await expect(invite).toBeInViewport()
    expect((await invite.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await invite.click()
    const sheet = page.getByRole('dialog', { name: 'Invite people' })
    await pasteEmails(sheet, uniqueAddress('phone'))

    await expect(
      sheet.getByRole('button', { name: 'Send invitation', exact: true }),
    ).toBeInViewport()
  })
})
