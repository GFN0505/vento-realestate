import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { createApprovalsTeamFixture } from '../support/fixtures'
import { signInAs } from '../support/sign-in'

// J-ONB-13: find out who changed something. The table is a laptop layout; phones list cards, so
// the search and open flows run on desktop and the cards have a test of their own.

test.describe.configure({ timeout: 120_000 })

async function openLog(page: Page, query = '') {
  await page.goto(`/settings/audit-log${query}`)
  await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible()
}

test.describe('on a laptop', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the table is a laptop layout')
  })

  test('searching narrows the log to the entries that mention the person', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openLog(page)

    await page.getByRole('searchbox', { name: 'Search the audit log' }).fill(team.changed.name)

    const rows = page.getByRole('row').filter({ hasText: team.changed.name })
    await expect(rows.first()).toBeVisible()
    await expect(page).toHaveURL(/q=Chidi/)
    // Every row left mentions him: the other people's entries are gone.
    const table = page.getByRole('table', { name: 'Audit log' })
    await expect(table.getByRole('row').filter({ hasText: team.holder.name })).toHaveCount(0)
  })

  test('a search with no match says so and Clear filters brings the entries back', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openLog(page)

    await page.getByRole('searchbox', { name: 'Search the audit log' }).fill('zzz-nobody-has-this')

    await expect(page.getByText('No entries match these filters.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByRole('table', { name: 'Audit log' })).toBeVisible()
  })

  test('opening an entry shows who, the before and after, and Back closes it', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openLog(page, `?q=${encodeURIComponent(team.changed.name)}`)
    const row = page.getByRole('row').filter({ hasText: team.changed.name }).first()
    await expect(row).toBeVisible()

    await row.getByRole('button').first().click()

    const entry = page.getByRole('dialog')
    await expect(entry.getByText('Who')).toBeVisible()
    await expect(entry.getByRole('heading', { name: 'Before → after' })).toBeVisible()
    await expect(page).toHaveURL(/open=/)
    await page.goBack()
    await expect(entry).toBeHidden()
  })

  test('exports the filtered log as a CSV file and records the export in the log', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)
    await openLog(page)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(/\.csv$/)
    const path = await file.path()
    const text = await readFile(path, 'utf8')
    expect(text).toContain(team.changed.name)
    await expect(page.getByText('Audit log exported')).toBeVisible()
    // The export is itself an entry, so the list refreshes to show it.
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: /export/i })
        .first(),
    ).toBeVisible()
  })

  test('someone without Settings access gets the 403 before any entry loads', async ({ page }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.holder, team.password)

    await page.goto('/settings/audit-log')

    await expect(
      page.getByRole('heading', { name: "You don't have access to Settings" }),
    ).toBeVisible()
  })

  test('a start date after the end date is refused on the dates and exporting is off', async ({
    page,
  }) => {
    const team = createApprovalsTeamFixture()
    await signInAs(page, team.owner, team.password)

    await openLog(page, '?from=2026-11-20&to=2026-11-10')

    await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })
})

test('on a phone each entry is a card that opens the same details', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'cards are the phone layout')
  const team = createApprovalsTeamFixture()
  await signInAs(page, team.owner, team.password)
  await openLog(page, `?q=${encodeURIComponent(team.changed.name)}`)

  await page
    .getByRole('button', { name: new RegExp(team.changed.name) })
    .first()
    .click()

  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Before → after' }),
  ).toBeVisible()
})
