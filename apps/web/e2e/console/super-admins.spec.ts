import { expect, type Page, test } from '@playwright/test'
import { signInToConsole } from '../support/console'
import {
  createMemberFixture,
  createSuperAdminFixture,
  createTeamFixture,
  platformActivity,
} from '../support/fixtures'

// J-ADM-03: add and remove a super-admin, then read it in Activity.

const dialog = (page: Page) => page.getByRole('dialog').first()
const rows = (page: Page) => page.getByTestId('super-admin-row')

async function addSuperAdmin(page: Page, email: string, reason: string) {
  await page.getByRole('button', { name: 'Add super-admin' }).click()
  await dialog(page).getByLabel('Email').fill(email)
  await dialog(page).getByRole('button', { name: 'Review' }).click()
  await dialog(page).getByLabel('Reason').fill(reason)
  await dialog(page)
    .getByRole('button', { name: /^Make .* a super-admin$/ })
    .click()
}

test.describe('the super-admins list', () => {
  test('shows you marked (you) and without a Remove button', async ({ page }) => {
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin, '/console/super-admins')

    const you = rows(page).filter({ hasText: admin.email })
    await expect(you).toContainText('(you)')
    await expect(you.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  })

  test('adding someone with a password-only account is refused with a message', async ({
    page,
  }) => {
    const team = createTeamFixture()
    const sales = team.members.sales
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/super-admins')

    await page.getByRole('button', { name: 'Add super-admin' }).click()
    await dialog(page)
      .getByLabel('Email')
      .fill(sales?.email ?? '')
    await dialog(page).getByRole('button', { name: 'Review' }).click()

    await expect(dialog(page).getByRole('alert')).toContainText(/two-step/i)
    await expect(dialog(page).getByLabel('Reason')).toHaveCount(0)
  })

  test('adding an address that is not an email is refused before anything is checked', async ({
    page,
  }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/super-admins')

    await page.getByRole('button', { name: 'Add super-admin' }).click()
    await dialog(page).getByLabel('Email').fill('not-an-email')
    await dialog(page).getByRole('button', { name: 'Review' }).click()

    await expect(
      dialog(page).getByText('Enter an email address, like tunde@ventoerp.com'),
    ).toBeVisible()
  })

  test('adding an email with no account is refused with a message', async ({ page }) => {
    await signInToConsole(page, createSuperAdminFixture('member'), '/console/super-admins')

    await page.getByRole('button', { name: 'Add super-admin' }).click()
    await dialog(page).getByLabel('Email').fill('nobody.here@test.vento.ng')
    await dialog(page).getByRole('button', { name: 'Review' }).click()

    await expect(dialog(page).getByRole('alert')).toContainText(/account/i)
  })
})

test.describe('adding and removing', () => {
  test('adds a person with two-step on, who then appears in the list, and removes them again', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    const newcomer = createMemberFixture()
    await signInToConsole(page, admin, '/console/super-admins')

    await addSuperAdmin(page, newcomer.email, 'Joins the release rota')

    await expect(rows(page).filter({ hasText: newcomer.email })).toBeVisible()
    const added = rows(page).filter({ hasText: newcomer.email })
    await added.getByRole('button', { name: /^Remove/ }).click()
    await expect(dialog(page)).toContainText(/Remove .* as a super-admin\?/)
    await dialog(page).getByLabel('Reason').fill('Left the team')
    await dialog(page)
      .getByRole('button', { name: /^Remove / })
      .click()

    await expect(rows(page).filter({ hasText: newcomer.email })).toHaveCount(0)
  })

  test('someone added as a super-admin gets the console, and when removed gets a 404 again', async ({
    browser,
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    const newcomer = createMemberFixture()
    await signInToConsole(page, admin, '/console/super-admins')
    await addSuperAdmin(page, newcomer.email, 'Joins the release rota')
    await expect(rows(page).filter({ hasText: newcomer.email })).toBeVisible()
    const other = await browser.newContext()
    const otherPage = await other.newPage()

    await signInToConsole(otherPage, newcomer)
    await expect(otherPage.getByRole('heading', { name: 'Organizations', level: 1 })).toBeVisible()
    await rows(page)
      .filter({ hasText: newcomer.email })
      .getByRole('button', { name: /^Remove/ })
      .click()
    await dialog(page).getByLabel('Reason').fill('Left the team')
    await dialog(page)
      .getByRole('button', { name: /^Remove / })
      .click()
    await expect(rows(page).filter({ hasText: newcomer.email })).toHaveCount(0)
    await otherPage.goto('/console/releases')

    await expect(otherPage.getByRole('heading', { name: "We can't find that page" })).toBeVisible()
    await other.close()
  })

  test('adding someone who is already a super-admin is refused', async ({ page }) => {
    const admin = createSuperAdminFixture('member')
    const second = createSuperAdminFixture('member')
    await signInToConsole(page, admin, '/console/super-admins')

    await page.getByRole('button', { name: 'Add super-admin' }).click()
    await dialog(page).getByLabel('Email').fill(second.email)
    await dialog(page).getByRole('button', { name: 'Review' }).click()

    await expect(dialog(page).getByRole('alert')).toBeVisible()
    await expect(dialog(page).getByLabel('Reason')).toHaveCount(0)
  })
})

test.describe('activity', () => {
  test('shows the add and the remove by that person, tagged Console, with their reasons', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    const newcomer = createMemberFixture()
    await signInToConsole(page, admin, '/console/super-admins')
    await addSuperAdmin(page, newcomer.email, 'Joins the release rota')
    const added = rows(page).filter({ hasText: newcomer.email })
    await expect(added).toBeVisible()
    await added.getByRole('button', { name: /^Remove/ }).click()
    await dialog(page).getByLabel('Reason').fill('Left the team')
    await dialog(page)
      .getByRole('button', { name: /^Remove / })
      .click()
    await expect(added).toHaveCount(0)

    await page.goto(`/console/activity?person=${admin.userId}`)

    const feed = page.getByRole('list', { name: 'Changes, newest first' })
    await expect(feed.getByText('“Joins the release rota”')).toBeVisible()
    await expect(feed.getByText('“Left the team”')).toBeVisible()
    await expect(feed.getByText('Console', { exact: true })).toHaveCount(2)
  })

  test('a break-glass change from the command line shows the rose Command line tag', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    platformActivity(admin.email)
    await signInToConsole(page, admin, `/console/activity?person=${admin.userId}`)

    const feed = page.getByRole('list', { name: 'Changes, newest first' })

    await expect(feed.getByText('Command line', { exact: true })).toBeVisible()
    await expect(feed.getByText('“e2e break-glass fixture”')).toBeVisible()
  })

  test('filtering by a person who has done nothing says no changes match and Clear filters resets it', async ({
    page,
  }) => {
    const admin = createSuperAdminFixture('member')
    await signInToConsole(page, admin, `/console/activity?person=${admin.userId}`)

    await expect(page.getByText('No changes match these filters.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()

    await expect(page.getByText('No changes match these filters.')).toHaveCount(0)
    await expect(page).not.toHaveURL(/person=/)
  })
})
