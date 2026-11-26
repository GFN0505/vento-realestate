import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  type CompaniesFixture,
  createCompaniesFixture,
  createMemberFixture,
  createNoCompanyFixture,
} from '../support/fixtures'
import { HOME_GREETING, signInAs, signInWithTotp } from '../support/sign-in'

// J-ONB-07: set up the organization and its companies. Row menus and the sub-navigation are
// desktop layouts, so most of it runs on the desktop project; the phone has its own block.

// Creating these fixtures signs people up for two-step, which is slow under load.
test.describe.configure({ timeout: 90_000 })

type Person = { email: string; name: string; totpSecret?: string }

const person = (fixture: CompaniesFixture, key: string): Person => {
  const found = fixture.members[key]
  if (!found) throw new Error(`no ${key} in the fixture`)
  return found
}

async function signInOn(page: Page, who: Person, password: string, path: string) {
  await signInAs(page, who, password)
  await page.goto(path)
}

/** The Add company sheet (a dialog named after its title). */
const addSheet = (page: Page) => page.getByRole('dialog', { name: 'Add company' })

/** A company's row in the Companies table. */
const companyRow = (page: Page, name: string): Locator =>
  page.getByRole('row').filter({ hasText: name })

/** The top-bar company switcher: a button (menu) or plain text (label only). */
const switcher = (page: Page) => page.getByRole('button', { name: /^Company\b/ })

async function openCompanies(page: Page) {
  await page.goto('/settings/companies')
  await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible()
}

async function fillCompany(sheet: Locator, name: string, rc?: string) {
  await sheet.getByLabel('Company name').fill(name)
  if (rc) {
    await sheet.getByLabel('RC number').fill(rc)
    await sheet.getByLabel('Company name').click() // blur tidies the RC number
  }
}

test.describe('on a laptop', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'row menus and the sub-navigation are desktop')
  })

  test.describe('the organization profile', () => {
    test('Settings opens on Organization with four sections and no company switcher', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInAs(page, person(fixture, 'owner'), fixture.password)
      await expect(switcher(page)).toBeVisible()

      await page.goto('/settings')

      await expect(page).toHaveURL(/\/settings\/organization$/)
      await expect(page.getByRole('heading', { name: 'Organization', level: 1 })).toBeVisible()
      const nav = page.getByRole('navigation', { name: 'Settings' })
      await expect(nav.getByRole('link')).toHaveText([
        'Organization',
        'Companies',
        'Team',
        'Roles & permissions',
      ])
      await expect(switcher(page)).toHaveCount(0)
    })

    test('editing the financial year and name saves with a toast and survives a reload', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/organization')
      const save = page.getByRole('button', { name: 'Save changes' }).first()
      await expect(save).toBeDisabled()
      const renamed = `${fixture.organizationName} Group`

      await page.getByLabel('Organization name').fill(renamed)
      await page.getByLabel('Financial year starts in').selectOption({ label: 'April' })
      await save.click()

      await expect(page.getByText('Organization details saved')).toBeVisible()
      await expect(save).toBeDisabled()
      await page.reload()
      await expect(page.getByLabel('Organization name')).toHaveValue(renamed)
      await expect(page.getByLabel('Financial year starts in')).toHaveValue('4')
    })

    test('leaving with unsaved changes asks first, and Keep editing stays on the page', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/organization')
      await page.getByLabel('Organization name').fill('Something else Ltd')

      await page
        .getByRole('navigation', { name: 'Settings' })
        .getByRole('link', { name: 'Companies' })
        .click()
      const ask = page.getByRole('alertdialog', { name: 'Discard changes to Organization?' })
      await expect(ask).toBeVisible()
      await ask.getByRole('button', { name: 'Keep editing' }).click()
      await expect(page).toHaveURL(/\/settings\/organization$/)
      await expect(page.getByLabel('Organization name')).toHaveValue('Something else Ltd')

      await page
        .getByRole('navigation', { name: 'Settings' })
        .getByRole('link', { name: 'Companies' })
        .click()
      await page
        .getByRole('alertdialog', { name: 'Discard changes to Organization?' })
        .getByRole('button', { name: 'Discard' })
        .click()
      await expect(page).toHaveURL(/\/settings\/companies/)
    })

    test('a blank organization name is refused with a message and nothing is saved', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/organization')

      await page.getByLabel('Organization name').fill('')
      await page.getByRole('button', { name: 'Save changes' }).first().click()

      await expect(page.getByLabel('Organization name')).toHaveAttribute('aria-invalid', 'true')
      await expect(page.getByText('Organization details saved')).toHaveCount(0)
    })
  })

  test.describe('adding a company', () => {
    test('Add company on Companies normalises the RC number, then Switch to it selects it', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

      await page.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await expect(
        sheet.getByText(
          'A separate registered company, like an SPV for one estate. To add another estate, create a project instead.',
        ),
      ).toBeVisible()
      await fillCompany(sheet, 'Lekki Pearl Estates Ltd', '1999001')
      await expect(sheet.getByLabel('RC number')).toHaveValue('RC 1999001')
      await sheet.getByRole('button', { name: 'Add company' }).click()

      await expect(page.getByText('Lekki Pearl Estates Ltd added')).toBeVisible()
      await expect(companyRow(page, 'Lekki Pearl Estates Ltd')).toContainText('RC 1999001')
      await page.getByRole('button', { name: 'Switch to it' }).click()
      await expect(page).toHaveURL(/entity=/)
      await page.goto('/')
      await expect(switcher(page)).toContainText('Lekki Pearl Estates Ltd')
    })

    test('the switcher adds a company over the page you are on', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInAs(page, person(fixture, 'owner'), fixture.password)

      await switcher(page).click()
      await page.getByRole('menuitem', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await fillCompany(sheet, 'Ikeja Heights SPV Ltd')
      await sheet.getByRole('button', { name: 'Add company' }).click()

      await expect(page.getByText('Ikeja Heights SPV Ltd added')).toBeVisible()
      await expect(page).toHaveURL(/\/(\?.*)?$/)
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
    })

    test('a one-company owner still gets a switcher menu with Add company', async ({ page }) => {
      const owner = createMemberFixture()
      await signInWithTotp(page, owner)

      await switcher(page).click()

      await expect(page.getByRole('menuitem', { name: 'Add company' })).toBeVisible()
    })

    test('an RC number used by an active company is refused on the field and the fields are kept', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')
      await page.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await fillCompany(sheet, 'Another Parkview Ltd', '1789234')

      await sheet.getByRole('button', { name: 'Add company' }).click()

      await expect(
        sheet.getByText('Parkview Residences SPV Ltd already uses RC 1789234.'),
      ).toBeVisible()
      await expect(sheet.getByLabel('Company name')).toHaveValue('Another Parkview Ltd')
      await expect(sheet.getByRole('button', { name: 'Restore it instead' })).toHaveCount(0)
    })

    test('an RC number used by an archived company offers Restore it instead, which restores it', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')
      await page.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await fillCompany(sheet, 'Ikoyi Again Ltd', '1832276')

      await sheet.getByRole('button', { name: 'Add company' }).click()
      await expect(
        sheet.getByText('Ikoyi Crest SPV Ltd (archived) already uses RC 1832276.'),
      ).toBeVisible()
      await sheet.getByRole('button', { name: 'Restore it instead' }).click()

      await expect(page.getByText('Ikoyi Crest SPV Ltd restored')).toBeVisible()
      await expect(sheet).toBeHidden()
      await expect(companyRow(page, 'Ikoyi Crest SPV Ltd')).toBeVisible()
      await expect(companyRow(page, 'Ikoyi Again Ltd')).toHaveCount(0)
    })

    test('a blank company name is refused with a message and the sheet stays open', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')
      await page.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)

      await sheet.getByRole('button', { name: 'Add company' }).click()

      await expect(sheet.getByLabel('Company name')).toHaveAttribute('aria-invalid', 'true')
      await expect(sheet).toBeVisible()
    })

    test('closing a sheet with typing in it asks before discarding', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')
      await page.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await fillCompany(sheet, 'Half typed Ltd')

      await sheet.getByRole('button', { name: 'Cancel' }).click()
      const ask = page.getByRole('alertdialog', { name: 'Discard your changes?' })
      await expect(ask).toBeVisible()
      await ask.getByRole('button', { name: 'Keep editing' }).click()
      await expect(sheet.getByLabel('Company name')).toHaveValue('Half typed Ltd')

      await sheet.getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('button', { name: 'Discard changes' }).click()
      await expect(sheet).toBeHidden()
    })

    test('the n key opens Add company on the Companies page', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')
      await expect(companyRow(page, 'Parkview Residences SPV Ltd')).toBeVisible()

      await page.keyboard.press('n')

      await expect(addSheet(page)).toBeVisible()
    })
  })

  test.describe('fixing, archiving and restoring', () => {
    test("editing Parkview's TIN saves only when something changed", async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

      await page.getByRole('button', { name: 'Parkview Residences SPV Ltd', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Parkview Residences SPV Ltd' })
      const save = sheet.getByRole('button', { name: 'Save changes' })
      await expect(save).toBeDisabled()
      await sheet.getByLabel('TIN').fill('12345678-0001')
      await save.click()

      await expect(page.getByText('Parkview Residences SPV Ltd updated')).toBeVisible()
      await expect(companyRow(page, 'Parkview Residences SPV Ltd')).toContainText('12345678-0001')
    })

    test('archiving a company nobody depends on shows Undo, and Undo brings it back', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      const holding = fixture.entities.holding.name
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

      await page.getByRole('button', { name: `Actions for ${holding}` }).click()
      await page.getByRole('menuitem', { name: 'Archive' }).click()

      await expect(page.getByText(`${holding} archived`)).toBeVisible()
      await expect(companyRow(page, holding)).toHaveCount(0)
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(companyRow(page, holding)).toBeVisible()
    })

    test('archiving a company that people can only see names them first, then restores from the Archived chip', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      const lekki = fixture.entities.lekki
      if (!lekki) throw new Error('no Lekki Gardens')
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

      await page.getByRole('button', { name: `Actions for ${lekki.name}` }).click()
      await page.getByRole('menuitem', { name: 'Archive' }).click()
      const confirm = page.getByRole('alertdialog', { name: `Archive ${lekki.name}?` })
      await expect(confirm).toContainText('Kunle Ojo')
      await expect(confirm).toContainText('Ope Martins')
      await expect(confirm).toContainText('can only see this company')
      await confirm.getByRole('button', { name: 'Archive company' }).click()
      await expect(page.getByText(`${lekki.name} archived`)).toBeVisible()

      await page.getByRole('button', { name: 'Archived', exact: true }).click()
      await expect(companyRow(page, lekki.name)).toBeVisible()
      await page.getByRole('button', { name: `Actions for ${lekki.name}` }).click()
      await page.getByRole('menuitem', { name: 'Restore' }).click()
      await expect(page.getByText(`${lekki.name} restored`)).toBeVisible()
      await expect(page).toHaveURL(/show=archived/)
      await page.getByRole('button', { name: 'Active', exact: true }).click()
      await expect(companyRow(page, lekki.name)).toBeVisible()
    })

    test('an archived company opens read-only with who archived it and a Restore button', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(
        page,
        person(fixture, 'owner'),
        fixture.password,
        '/settings/companies?show=archived',
      )

      await page.getByRole('button', { name: 'Ikoyi Crest SPV Ltd', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Ikoyi Crest SPV Ltd' })
      await expect(sheet.getByText(/^Archived .* by Olumide Bankole/)).toBeVisible()
      await expect(sheet.getByLabel('Company name')).toHaveCount(0)
      await sheet.getByRole('button', { name: 'Restore' }).click()

      await expect(page.getByText('Ikoyi Crest SPV Ltd restored')).toBeVisible()
    })

    test('the last active company cannot be archived and the menu says why', async ({ page }) => {
      const owner = createMemberFixture()
      await signInWithTotp(page, owner)
      await openCompanies(page)

      await page.getByRole('button', { name: /^Actions for / }).click()

      const archive = page.getByRole('menuitem', { name: /^Archive/ })
      await expect(archive).toHaveAttribute('aria-disabled', 'true')
      await expect(archive).toContainText('needs at least one active company.')
    })

    test('the Archived chip with nothing archived says so', async ({ page }) => {
      const owner = createMemberFixture()
      await signInWithTotp(page, owner)
      await page.goto('/settings/companies?show=archived')

      await expect(page.getByText('No archived companies.')).toBeVisible()
    })

    test('a search that matches nothing offers Clear search', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

      await page.getByLabel('Search by name or RC number').fill('zzzz')
      await expect(page.getByText('No companies match "zzzz".')).toBeVisible()
      await page.getByRole('button', { name: 'Clear search' }).click()

      await expect(companyRow(page, 'Parkview Residences SPV Ltd')).toBeVisible()
    })

    test('the search finds a company by its RC number', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

      await page.getByLabel('Search by name or RC number').fill('1789234')

      await expect(companyRow(page, 'Parkview Residences SPV Ltd')).toBeVisible()
      await expect(companyRow(page, 'Lekki Gardens SPV Ltd')).toHaveCount(0)
    })
  })

  test.describe('the plan limit', () => {
    test('an owner at the limit gets the plan message instead of the form, with Talk to Vento', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture('starter')
      await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')
      await expect(page.getByText(/2 of 2 active companies on your Starter plan/)).toBeVisible()

      await page.getByRole('button', { name: 'Add company' }).click()

      const dialog = page.getByRole('dialog', { name: "All your plan's companies are in use" })
      await expect(dialog).toContainText('Your Starter plan includes 2 active companies.')
      await expect(dialog.getByRole('link', { name: 'Talk to Vento' })).toBeVisible()
      await expect(addSheet(page)).toHaveCount(0)
    })

    test('the switcher gives an owner at the limit the same plan message', async ({ page }) => {
      const fixture = createCompaniesFixture('starter')
      await signInAs(page, person(fixture, 'owner'), fixture.password)

      await switcher(page).click()
      await page.getByRole('menuitem', { name: 'Add company' }).click()

      await expect(
        page.getByRole('dialog', { name: "All your plan's companies are in use" }),
      ).toBeVisible()
    })

    test('an admin at the limit gets the form, and the server refusal names the owner and keeps the fields', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture('starter')
      await signInOn(page, person(fixture, 'admin'), fixture.password, '/settings/companies')
      await page.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await fillCompany(sheet, 'Third Company Ltd')

      await sheet.getByRole('button', { name: 'Add company' }).click()

      await expect(
        sheet.getByText(
          'Your organization has reached its limit of 2 active companies. Ask Olumide Bankole (owner).',
        ),
      ).toBeVisible()
      await expect(sheet.getByLabel('Company name')).toHaveValue('Third Company Ltd')
      await expect(sheet.getByText(/Starter/)).toHaveCount(0)
    })

    test('restoring at the limit is refused too, and archiving one frees a place', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture('starter')
      await signInOn(
        page,
        person(fixture, 'owner'),
        fixture.password,
        '/settings/companies?show=archived',
      )

      await page.getByRole('button', { name: 'Actions for Ikoyi Crest SPV Ltd' }).click()
      await page.getByRole('menuitem', { name: 'Restore' }).click()

      await expect(
        page.getByRole('dialog', { name: "All your plan's companies are in use" }),
      ).toBeVisible()
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Active', exact: true }).click()
      await page
        .getByRole('button', { name: `Actions for ${fixture.entities.holding.name}` })
        .click()
      await page.getByRole('menuitem', { name: 'Archive' }).click()
      await expect(page.getByText(`${fixture.entities.holding.name} archived`)).toBeVisible()
      await page.getByRole('button', { name: 'Archived', exact: true }).click()
      await page.getByRole('button', { name: 'Actions for Ikoyi Crest SPV Ltd' }).click()
      await page.getByRole('menuitem', { name: 'Restore' }).click()
      await expect(page.getByText('Ikoyi Crest SPV Ltd restored')).toBeVisible()
    })
  })

  test.describe('the setup checklist', () => {
    test('We only have one company ticks the step, and Undo opens it again', async ({ page }) => {
      const owner = createMemberFixture()
      await signInWithTotp(page, owner)
      const card = page.getByRole('region', { name: 'Finish setting up' })
      await expect(card).toContainText('3 of 5 done')

      await card.getByRole('button', { name: 'We only have one company' }).click()

      await expect(page.getByText('Noted: you have one company')).toBeVisible()
      await expect(card).toContainText('4 of 5 done')
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(card).toContainText('3 of 5 done')
      await expect(card.getByText('Add your other companies (SPVs), to do')).toBeVisible()
    })

    test('adding a second company from the checklist ticks the step', async ({ page }) => {
      const owner = createMemberFixture()
      await signInWithTotp(page, owner)
      const card = page.getByRole('region', { name: 'Finish setting up' })

      await card.getByRole('button', { name: 'Add company' }).click()
      const sheet = addSheet(page)
      await fillCompany(sheet, 'Second SPV Ltd')
      await sheet.getByRole('button', { name: 'Add company' }).click()

      await expect(page.getByText('Second SPV Ltd added')).toBeVisible()
      await expect(card).toContainText('4 of 5 done')
    })

    test('a Parkview-only admin is not offered the other-companies step', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInAs(page, person(fixture, 'parkviewAdmin'), fixture.password)

      const card = page.getByRole('region', { name: 'Finish setting up' })
      await expect(card.getByText('Add your other companies (SPVs), to do')).toHaveCount(0)
      await expect(card.getByRole('button', { name: 'Add company' })).toHaveCount(0)
    })
  })

  test.describe('who can do what', () => {
    test('a Parkview-limited admin sees only Parkview, with no Add, Archive or Restore', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(
        page,
        person(fixture, 'parkviewAdmin'),
        fixture.password,
        '/settings/companies',
      )

      await expect(companyRow(page, 'Parkview Residences SPV Ltd')).toBeVisible()
      await expect(companyRow(page, 'Lekki Gardens SPV Ltd')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Add company' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Actions for Parkview Residences SPV Ltd' }).click()
      await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /Archive/ })).toHaveCount(0)
    })

    test('a Parkview-limited admin fixes a Parkview detail', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInOn(
        page,
        person(fixture, 'parkviewAdmin'),
        fixture.password,
        '/settings/companies',
      )

      await page.getByRole('button', { name: 'Parkview Residences SPV Ltd', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Parkview Residences SPV Ltd' })
      await sheet.getByLabel('TIN').fill('87654321-0001')
      await sheet.getByRole('button', { name: 'Save changes' }).click()

      await expect(page.getByText('Parkview Residences SPV Ltd updated')).toBeVisible()
    })

    test('a Parkview-limited admin reads Organization read-only with who can change it', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInOn(
        page,
        person(fixture, 'parkviewAdmin'),
        fixture.password,
        '/settings/organization',
      )

      await expect(
        page.getByText(
          'Only people with access to every company can change this. Ask Olumide Bankole (owner).',
        ),
      ).toBeVisible()
      await expect(page.getByLabel('Organization name')).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    })

    test('a one-company admin sees the company as a label, not a menu', async ({ page }) => {
      const fixture = createCompaniesFixture()
      await signInAs(page, person(fixture, 'parkviewAdmin'), fixture.password)

      await expect(page.getByText('Parkview Residences SPV Ltd').first()).toBeVisible()
      await expect(switcher(page)).toHaveCount(0)
    })

    test('Sales opening Companies gets the 403 and the page asks the server for nothing', async ({
      page,
    }) => {
      const fixture = createCompaniesFixture()
      await signInAs(page, person(fixture, 'sales'), fixture.password)
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
      const seen: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/rpc/')) seen.push(url.pathname)
      })

      await page.goto('/settings/companies')

      await expect(
        page.getByRole('heading', { name: "You don't have access to Settings" }),
      ).toBeVisible()
      expect(seen.filter((path) => path.startsWith('/rpc/organization/'))).toEqual([])
      expect(seen.filter((path) => path === '/rpc/entities/archivePreview')).toEqual([])
    })
  })

  test.describe('no company', () => {
    test('a member limited to an archived company sees No company and who to ask', async ({
      page,
    }) => {
      const fixture = createNoCompanyFixture()
      await signInAs(page, fixture.member, fixture.password)

      await expect(page.getByText('No company').first()).toBeVisible()
      await expect(
        page.getByText(
          `You don't have access to any active company in ${fixture.organizationName}.`,
        ),
      ).toBeVisible()
      await expect(page.getByText(/Ask .* to give you access\./)).toBeVisible()
    })
  })
})

test.describe('on a phone', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout')
  })

  test('Companies are cards with a sticky Add company that opens a full-height sheet', async ({
    page,
  }) => {
    const fixture = createCompaniesFixture()
    await signInOn(page, person(fixture, 'owner'), fixture.password, '/settings/companies')

    const cards = page.getByRole('list', { name: 'Companies' })
    await expect(cards.getByRole('button', { name: /Parkview Residences SPV Ltd/ })).toBeVisible()
    await page.getByRole('button', { name: 'Add company' }).click()

    const sheet = addSheet(page)
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    const viewport = page.viewportSize()
    expect(box?.height ?? 0).toBeGreaterThan((viewport?.height ?? 0) * 0.9)
    await expect(sheet.getByRole('button', { name: 'Add company' })).toBeInViewport()
  })

  test('an archived company opens at the foot with Restore on a phone', async ({ page }) => {
    const fixture = createCompaniesFixture()
    await signInOn(
      page,
      person(fixture, 'owner'),
      fixture.password,
      '/settings/companies?show=archived',
    )

    await page.getByRole('button', { name: /Ikoyi Crest SPV Ltd/ }).click()
    await page
      .getByRole('dialog', { name: 'Ikoyi Crest SPV Ltd' })
      .getByRole('button', { name: 'Restore' })
      .click()

    await expect(page.getByText('Ikoyi Crest SPV Ltd restored')).toBeVisible()
  })
})
