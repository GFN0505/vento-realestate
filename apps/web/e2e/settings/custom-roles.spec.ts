import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  type CustomRoleFixture,
  createCustomRoleFixture,
  createRoleEditorFixture,
} from '../support/fixtures'
import { HOME_GREETING, signInAs } from '../support/sign-in'
import { openTeam, personRow } from '../support/team'

// J-ONB-08: make a role that fits the job. Tables and grids are desktop layouts; the phone's
// module sheet has its own block at the end.

test.describe.configure({ timeout: 90_000 })

const cell = (page: Page, name: string): Locator => page.getByRole('checkbox', { name })
const rolePath = (fixture: { role: { id: string } }) => `/settings/roles/${fixture.role.id}`
const saveBar = (page: Page) => page.getByRole('region', { name: 'Unsaved changes' })
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

async function ownerOnRole(page: Page, fixture: CustomRoleFixture) {
  await signInAs(page, fixture.owner, fixture.password)
  await page.goto(rolePath(fixture))
  await expect(page.getByRole('heading', { name: fixture.role.name, level: 1 })).toBeVisible()
}

/** The journey's three changes: Sales and Land & title View off, Documents Create on. */
async function makeThreeChanges(page: Page) {
  await cell(page, 'Sales & CRM: View').click()
  await cell(page, 'Land & title: View').click()
  await cell(page, 'Documents & contracts: Create').click()
}

test.describe('on a laptop', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the grid is a desktop layout')
  })

  test.describe('reading roles', () => {
    test('the list shows the nine built-in roles with counts and two-step, then custom roles', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await signInAs(page, fixture.owner, fixture.password)

      await page.goto('/settings/roles')

      const rows = page.getByRole('row')
      for (const name of [
        'Owner',
        'Admin',
        'Finance',
        'HR',
        'Sales',
        'Project manager',
        'Facility',
        'Viewer',
      ]) {
        await expect(rows.filter({ hasText: name }).first()).toBeVisible()
      }
      await expect(rows.filter({ hasText: 'Finance' }).first()).toContainText('Required')
      await expect(page.getByRole('rowgroup').filter({ hasText: 'Custom roles' })).toBeVisible()
      const custom = rows.filter({ hasText: 'Site engineer' })
      await expect(custom).toContainText('Custom')
      await expect(custom).toContainText('1 person')
    })

    test('a built-in role opens read-only with the note and no boxes to tick', async ({ page }) => {
      const fixture = createCustomRoleFixture()
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/roles')

      await page.getByRole('link', { name: 'Project manager', exact: true }).click()

      await expect(page.getByRole('heading', { name: 'Project manager', level: 1 })).toBeVisible()
      await expect(
        page.getByText(
          "Built-in roles can't be changed. Duplicate this role to make your own version.",
        ),
      ).toBeVisible()
      await expect(page.getByRole('checkbox')).toHaveCount(0)
      await expect(page.getByRole('switch', { name: 'Require two-step sign-in' })).toBeDisabled()
    })

    test('another organization or made-up role id says the role no longer exists', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture()
      await signInAs(page, fixture.owner, fixture.password)

      await page.goto('/settings/roles/019e0000-0000-7000-8000-000000000000')

      await expect(page.getByText('That role no longer exists.')).toBeVisible()
      await page.getByRole('link', { name: 'See all roles' }).click()
      await expect(page).toHaveURL(/\/settings\/roles$/)
    })
  })

  test.describe('making a role', () => {
    test('duplicating Project manager into Site engineer, editing, saving and undoing', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture()
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/roles')
      await page.getByRole('link', { name: 'Project manager', exact: true }).click()

      await page.getByRole('button', { name: 'Duplicate role' }).click()
      const dialog = page.getByRole('dialog', { name: 'New role' })
      await expect(dialog.getByLabel('Name')).toHaveValue('Copy of Project manager')
      await dialog.getByLabel('Name').fill('Site engineer')
      await dialog.getByRole('button', { name: 'Create role' }).click()

      await expect(page.getByText('Site engineer created')).toBeVisible()
      await expect(page.getByLabel('Role name')).toHaveValue('Site engineer')
      await makeThreeChanges(page)
      await expect(saveBar(page)).toContainText('3 changes · applies to nobody yet')
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(page.getByText('Site engineer saved')).toBeVisible()
      await expect(saveBar(page)).toHaveCount(0)
      await expect(cell(page, 'Sales & CRM: View')).not.toBeChecked()
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(page.getByText('Site engineer put back')).toBeVisible()
      await expect(cell(page, 'Sales & CRM: View')).toBeChecked()
      await expect(cell(page, 'Documents & contracts: Create')).not.toBeChecked()
    })

    test('a name already in use is refused on the field and the dialog stays open', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/roles')

      await page.getByRole('button', { name: 'New role' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'New role' })
      await dialog.getByLabel('Name').fill('Site engineer')
      await dialog.getByRole('button', { name: 'Create role' }).click()

      await expect(dialog.getByText('A role called Site engineer already exists.')).toBeVisible()
      await expect(dialog).toBeVisible()
    })

    test('a blank name is refused with a message', async ({ page }) => {
      const fixture = createCustomRoleFixture()
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/roles')

      await page.getByRole('button', { name: 'New role' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'New role' })
      await dialog.getByLabel('Name').fill('')
      await dialog.getByRole('button', { name: 'Create role' }).click()

      await expect(dialog.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true')
      await expect(dialog).toBeVisible()
    })

    test('n opens New role, and Escape closes it', async ({ page }) => {
      const fixture = createCustomRoleFixture()
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/roles')
      await expect(page.getByRole('link', { name: 'Project manager', exact: true })).toBeVisible()

      await page.keyboard.press('n')
      const dialog = page.getByRole('dialog', { name: 'New role' })
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')

      await expect(dialog).toBeHidden()
    })
  })

  test.describe('editing the grid', () => {
    test('any tick adds View, and unticking View clears the whole row', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await expect(cell(page, 'Executive analytics: View')).not.toBeChecked()

      await cell(page, 'Executive analytics: Export').click()

      await expect(cell(page, 'Executive analytics: View')).toBeChecked()
      await expect(cell(page, 'Executive analytics: Export')).toBeChecked()
      await expect(cell(page, 'Projects & construction: Delete')).toBeChecked()
      await cell(page, 'Projects & construction: View').click()
      await expect(cell(page, 'Projects & construction: Create')).not.toBeChecked()
      await expect(cell(page, 'Projects & construction: Delete')).not.toBeChecked()
      await expect(saveBar(page)).toContainText(/\d+ changes/)
    })

    test('the grid can be driven from the keyboard, and Ctrl or Cmd S saves', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await cell(page, 'Documents & contracts: Create').focus()
      await page.keyboard.press('Space')
      await expect(cell(page, 'Documents & contracts: Create')).toBeChecked()
      await page.keyboard.press('ControlOrMeta+s')

      await expect(page.getByText('Site engineer saved')).toBeVisible()
    })

    test('ticking a Finance edit locks two-step on and explains why, and unticking frees it', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      const twoStep = page.getByRole('switch', { name: 'Require two-step sign-in' })
      await expect(twoStep).not.toBeChecked()
      await expect(twoStep).toBeEnabled()

      await cell(page, 'Finance: Edit').click()

      await expect(twoStep).toBeChecked()
      await expect(twoStep).toBeDisabled()
      await expect(
        page.getByText("Required because this role can manage money, payroll or people's access."),
      ).toBeVisible()
      await cell(page, 'Finance: Edit').click()
      await expect(twoStep).toBeEnabled()
      await expect(twoStep).not.toBeChecked()
    })

    test('a role with Settings edit is locked to two-step the same way', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await cell(page, 'Settings: Edit').click()

      await expect(page.getByRole('switch', { name: 'Require two-step sign-in' })).toBeDisabled()
    })

    test('a role cannot be saved with nothing ticked', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      for (const module of [
        'Land & title',
        'Projects & construction',
        'Sales & CRM',
        'Facility & estate',
        'Compliance',
        'Documents & contracts',
      ]) {
        await cell(page, `${module}: View`).click()
      }

      await expect(saveBar(page)).toContainText('Give this role access to at least one area')
      await expect(saveBar(page).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    })

    test('Discard puts the ticks back', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await makeThreeChanges(page)

      await saveBar(page).getByRole('button', { name: 'Discard' }).click()

      await expect(saveBar(page)).toHaveCount(0)
      await expect(cell(page, 'Sales & CRM: View')).toBeChecked()
    })

    test('Discard puts the ticks back and its toast offers Undo to bring them again', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await makeThreeChanges(page)

      await saveBar(page).getByRole('button', { name: 'Discard' }).click()
      await expect(cell(page, 'Sales & CRM: View')).toBeChecked()
      await page.getByRole('button', { name: 'Undo' }).click()

      await expect(cell(page, 'Sales & CRM: View')).not.toBeChecked()
      await expect(saveBar(page)).toContainText('3 changes')
    })

    test('arrow keys move between boxes like a spreadsheet', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await cell(page, 'Projects & construction: View').focus()
      await page.keyboard.press('ArrowRight')
      await expect(cell(page, 'Projects & construction: Create')).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(cell(page, 'Sales & CRM: Create')).toBeFocused()
    })

    test('leaving with unsaved ticks asks first', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await makeThreeChanges(page)

      await page.getByRole('link', { name: 'Roles & permissions' }).first().click()

      const ask = page.getByRole('alertdialog', { name: 'Discard changes to Site engineer?' })
      await expect(ask).toBeVisible()
      await ask.getByRole('button', { name: 'Keep editing' }).click()
      await expect(cell(page, 'Sales & CRM: View')).not.toBeChecked()
    })

    test('the save bar counts the people it reaches', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await makeThreeChanges(page)

      await expect(saveBar(page)).toContainText(
        '3 changes · applies to 1 person on their next click',
      )
    })
  })

  test.describe('saving, Undo and the name', () => {
    test('Undo after someone else saved in between is refused with Reload, and Reload shows their save', async ({
      page,
      browser,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await cell(page, 'Documents & contracts: Create').click()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Site engineer saved')).toBeVisible()
      const context = await browser.newContext({
        storageState: await page.context().storageState(),
      })
      const other = await context.newPage()
      await other.goto(rolePath(fixture))
      await cell(other, 'Executive analytics: View').click()
      await other.getByRole('button', { name: 'Save changes' }).click()
      await expect(other.getByText('Site engineer saved')).toBeVisible()

      await page.getByRole('button', { name: 'Undo' }).click()

      await expect(page.getByText(/changed Site engineer a moment ago/)).toBeVisible()
      await page.getByRole('button', { name: 'Reload' }).click()
      await expect(cell(page, 'Executive analytics: View')).toBeChecked()
      await expect(cell(page, 'Documents & contracts: Create')).toBeChecked()
      await context.close()
    })

    test('Undo with unsaved ticks on the page asks first, and Keep editing leaves everything alone', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await cell(page, 'Documents & contracts: Create').click()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Site engineer saved')).toBeVisible()
      await cell(page, 'Executive analytics: View').click()

      await page.getByRole('button', { name: 'Undo' }).click()

      const ask = page.getByRole('alertdialog', { name: 'Undo the save to Site engineer?' })
      await expect(ask).toBeVisible()
      await ask.getByRole('button', { name: 'Keep editing' }).click()
      await expect(cell(page, 'Executive analytics: View')).toBeChecked()
      await expect(cell(page, 'Documents & contracts: Create')).toBeChecked()
    })

    test('Undo can be done more than once in a row of saves: save, Undo, save again', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await cell(page, 'Documents & contracts: Create').click()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(page.getByText('Site engineer put back')).toBeVisible()

      await cell(page, 'Documents & contracts: Create').click()
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(cell(page, 'Documents & contracts: Create')).toBeChecked()
      await page.reload()
      await expect(cell(page, 'Documents & contracts: Create')).toBeChecked()
    })

    test('an emptied name is refused on the name and nothing is saved', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await page.getByLabel('Role name').fill('')
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(page.getByLabel('Role name')).toHaveAttribute('aria-invalid', 'true')
      await expect(page.locator('#role-name-error')).toBeVisible()
      await expect(page.getByText('Site engineer saved')).toHaveCount(0)
    })

    test('the name stops at 40 characters', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await page.getByLabel('Role name').fill('x'.repeat(60))

      await expect(page.getByLabel('Role name')).toHaveValue('x'.repeat(40))
    })

    test('renaming to a name another role uses is refused on the name', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await page.getByLabel('Role name').fill('Viewer')
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(page.locator('#role-name-error')).toHaveText(
        'A role called Viewer already exists.',
      )
      await expect(page.getByLabel('Role name')).toHaveValue('Viewer')
    })

    test('a rename saves and shows on the roles list and Team', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await page.getByLabel('Role name').fill('Site lead')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Site lead saved')).toBeVisible()

      await openTeam(page)
      await expect(personRow(page, fixture.holder.name)).toContainText('Site lead')
    })

    test('Duplicate role and the more-actions menu wait while there are unsaved ticks', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)

      await cell(page, 'Documents & contracts: Create').click()

      await expect(page.getByRole('button', { name: 'Duplicate role' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      await expect(
        page.getByRole('button', { name: 'More actions for Site engineer' }),
      ).toBeDisabled()
      await saveBar(page).getByRole('button', { name: 'Discard' }).click()
      await expect(page.getByRole('button', { name: 'Duplicate role' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
  })

  test.describe('two people editing one role', () => {
    test('the second save is refused with Reload, nothing is overwritten, and Reload shows the first', async ({
      page,
      browser,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      const context = await browser.newContext({
        storageState: await page.context().storageState(),
      })
      const other = await context.newPage()
      await other.goto(rolePath(fixture))
      await expect(cell(other, 'Sales & CRM: View')).toBeVisible()

      await cell(page, 'Documents & contracts: Create').click()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Site engineer saved')).toBeVisible()
      await cell(other, 'Executive analytics: View').click()
      await other.getByRole('button', { name: 'Save changes' }).click()

      await expect(
        other.getByText(/changed Site engineer a moment ago\. Reload to see the latest/),
      ).toBeVisible()
      await other.getByRole('button', { name: 'Reload' }).click()
      await expect(cell(other, 'Documents & contracts: Create')).toBeChecked()
      await expect(cell(other, 'Executive analytics: View')).not.toBeChecked()
      await expect(saveBar(other)).toHaveCount(0)
      await context.close()
    })
  })

  test.describe('preview, assign and delete', () => {
    test('Preview this role is disabled until saved, then Home opens as that role and Stop preview ends it', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await ownerOnRole(page, fixture)
      await makeThreeChanges(page)
      const preview = page.getByRole('button', { name: 'Preview this role' })
      await expect(preview).toHaveAttribute('aria-disabled', 'true')
      await preview.focus()
      await expect(
        page.getByRole('tooltip').getByText('Save your changes to preview them.'),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Site engineer saved')).toBeVisible()

      await preview.click()

      const banner = page.getByRole('status').filter({ hasText: 'Previewing as Site engineer.' })
      await expect(banner).toBeVisible()
      await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
      await expect(mainNav(page).getByRole('link', { name: /^Projects/ })).toBeVisible()
      await expect(mainNav(page).getByRole('link', { name: /^Documents/ })).toBeVisible()
      await expect(mainNav(page).getByRole('link', { name: /^Sales/ })).toHaveCount(0)
      await expect(mainNav(page).getByRole('link', { name: /^Land & title/ })).toHaveCount(0)
      await banner.getByRole('button', { name: 'Stop preview' }).click()
      await expect(banner).toHaveCount(0)
    })

    test('a role given on Team reaches the member when they return to the tab, with no sign-out', async ({
      page,
      browser,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await signInAs(page, fixture.owner, fixture.password)
      const context = await browser.newContext()
      const member = await context.newPage()
      await signInAs(member, fixture.viewer, fixture.password)
      await expect(mainNav(member).getByRole('link', { name: /^Finance/ })).toBeVisible()

      await openTeam(page)
      await personRow(page, fixture.viewer.name)
        .getByRole('button', { name: /^Role for Chidi Okafor/ })
        .click()
      await page.getByRole('menuitemradio', { name: 'Site engineer' }).click()
      await expect(page.getByText('Chidi Okafor is now Site engineer')).toBeVisible()

      // The sidebar follows `me`, which refreshes when the tab is focused again (or after 30 s).
      await member.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
      await expect(mainNav(member).getByRole('link', { name: /^Finance/ })).toHaveCount(0)
      await expect(mainNav(member).getByRole('link', { name: /^Projects/ })).toBeVisible()
      await context.close()
    })

    test('custom roles sit under a divider in the Team role menu', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await signInAs(page, fixture.owner, fixture.password)
      await openTeam(page)

      await personRow(page, fixture.viewer.name)
        .getByRole('button', { name: /^Role for Chidi Okafor/ })
        .click()

      const menu = page.getByRole('menu')
      await expect(menu.getByRole('separator')).toBeVisible()
      await expect(menu.getByRole('menuitemradio', { name: 'Site engineer' })).toBeVisible()
    })

    test('a held role cannot be deleted and links to Team, then Delete removes it everywhere', async ({
      page,
    }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/roles')

      await page.getByRole('button', { name: 'Actions for Site engineer' }).click()
      const held = page.getByRole('menuitem', { name: /^Delete role/ })
      await expect(held).toBeDisabled()
      await expect(held).toContainText('Move 1 person to another role first')
      await page.getByRole('menuitem', { name: 'Show who has it' }).click()

      await expect(page).toHaveURL(new RegExp(`/settings/team\\?.*role=${fixture.role.id}`))
      const bayo = personRow(page, fixture.holder.name)
      await bayo.getByRole('button', { name: /^Role for Bayo Ogunleye/ }).click()
      await page.getByRole('menuitemradio', { name: 'Viewer' }).click()
      await expect(page.getByText('Bayo Ogunleye is now Viewer')).toBeVisible()

      await page.goto('/settings/roles')
      await page.getByRole('button', { name: 'Actions for Site engineer' }).click()
      await page.getByRole('menuitem', { name: 'Delete role' }).click()
      await page.getByRole('button', { name: 'Delete Site engineer' }).click()

      await expect(page.getByText('Site engineer deleted')).toBeVisible()
      await expect(page).toHaveURL(/\/settings\/roles$/)
      await expect(page.getByRole('link', { name: 'Site engineer', exact: true })).toHaveCount(0)
      await openTeam(page)
      await personRow(page, fixture.viewer.name)
        .getByRole('button', { name: /^Role for Chidi Okafor/ })
        .click()
      await expect(page.getByRole('menuitemradio', { name: 'Site engineer' })).toHaveCount(0)
    })

    test('the confirm names the role and Cancel keeps it', async ({ page }) => {
      const fixture = createCustomRoleFixture('Site engineer')
      await signInAs(page, fixture.owner, fixture.password)
      await page.goto('/settings/team')
      await personRow(page, fixture.holder.name)
        .getByRole('button', { name: /^Role for Bayo Ogunleye/ })
        .click()
      await page.getByRole('menuitemradio', { name: 'Viewer' }).click()
      await expect(page.getByText('Bayo Ogunleye is now Viewer')).toBeVisible()
      await page.goto(rolePath(fixture))

      await page.getByRole('button', { name: 'More actions for Site engineer' }).click()
      await page.getByRole('menuitem', { name: 'Delete role' }).click()
      const confirm = page.getByRole('alertdialog', { name: 'Delete Site engineer?' })
      await expect(confirm).toContainText('Nobody has this role.')
      await confirm.getByRole('button', { name: 'Cancel' }).click()

      await expect(page.getByRole('heading', { name: 'Site engineer', level: 1 })).toBeVisible()
    })
  })

  test.describe('the permission ceiling', () => {
    test('a custom Settings editor cannot assign roles wider than their own', async ({ page }) => {
      const fixture = createRoleEditorFixture()
      await signInAs(page, fixture.editor, fixture.password)
      await openTeam(page)

      await personRow(page, fixture.sales.name)
        .getByRole('button', { name: /^Role for Grace Umeh/ })
        .click()

      const menu = page.getByRole('menu')
      await expect(menu.getByRole('menuitemradio', { name: 'Sales' })).toBeVisible()
      for (const wider of ['Owner', 'Admin', 'Finance', 'HR']) {
        await expect(menu.getByRole('menuitemradio', { name: wider, exact: true })).toHaveCount(0)
      }
    })

    test('an admin they cannot manage is a read-only row with the reason', async ({ page }) => {
      const fixture = createRoleEditorFixture()
      await signInAs(page, fixture.editor, fixture.password)
      await openTeam(page)
      const kemi = personRow(page, fixture.admin.name)

      await expect(kemi.getByRole('button', { name: /^Role for Kemi Adebayo/ })).toHaveCount(0)
      await kemi.getByRole('button', { name: fixture.admin.name, exact: true }).click()

      await expect(
        page.getByText(/Kemi Adebayo can do things you can't\. Ask Olumide Bankole/),
      ).toBeVisible()
    })

    test('a wider built-in role opens read-only and cannot be duplicated', async ({ page }) => {
      const fixture = createRoleEditorFixture()
      await signInAs(page, fixture.editor, fixture.password)
      await page.goto('/settings/roles')

      await page.getByRole('link', { name: 'Admin', exact: true }).click()

      await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible()
      await expect(page.getByRole('checkbox')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Duplicate role' })).toHaveCount(0)
    })

    test('a role they can copy is editable, with boxes beyond their own access greyed out', async ({
      page,
    }) => {
      const fixture = createRoleEditorFixture()
      await signInAs(page, fixture.editor, fixture.password)
      await page.goto('/settings/roles')
      await page.getByRole('link', { name: 'Sales', exact: true }).click()
      await page.getByRole('button', { name: 'Duplicate role' }).click()
      await page.getByRole('dialog', { name: 'New role' }).getByLabel('Name').fill('Sales plus')
      await page.getByRole('button', { name: 'Create role' }).click()
      await expect(page.getByLabel('Role name')).toHaveValue('Sales plus')

      await expect(cell(page, 'Finance: Create')).toBeDisabled()
      await expect(cell(page, 'HR & payroll: View')).toBeDisabled()
      await expect(cell(page, 'Settings: Create')).toBeEnabled()
      await expect(page.getByText("Boxes with a lock are actions you don't have.")).toBeVisible()
    })

    test('nobody edits their own role: it opens read-only with who to ask', async ({ page }) => {
      const fixture = createRoleEditorFixture()
      await signInAs(page, fixture.editor, fixture.password)

      await page.goto(rolePath(fixture))

      await expect(page.getByRole('heading', { name: 'Office manager', level: 1 })).toBeVisible()
      await expect(
        page.getByText('You have this role. Ask another owner or admin to change it.'),
      ).toBeVisible()
      await expect(page.getByRole('checkbox')).toHaveCount(0)
      await expect(page.getByLabel('Role name')).toHaveCount(0)
    })

    test('a Sales member typing the roles address gets the 403', async ({ page }) => {
      const fixture = createRoleEditorFixture()
      await signInAs(page, fixture.sales, fixture.password)

      await page.goto('/settings/roles')

      await expect(
        page.getByRole('heading', { name: "You don't have access to Settings" }),
      ).toBeVisible()
    })
  })
})

test.describe('on a phone', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout')
  })

  test('a module opens a sheet of switches, and the save bar sits above the tabs', async ({
    page,
  }) => {
    const fixture = createCustomRoleFixture('Site engineer')
    await ownerOnRole(page, fixture)

    await page.getByRole('button', { name: /^Documents & contracts: .* Change$/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Documents & contracts' })
    await sheet.getByRole('switch', { name: 'Documents & contracts: Create' }).click()
    await sheet.getByRole('button', { name: 'Done' }).click()

    const bar = saveBar(page)
    await expect(bar).toContainText('1 change')
    const tabs = page.getByRole('navigation', { name: 'Tabs' })
    const barBox = await bar.boundingBox()
    const tabsBox = await tabs.boundingBox()
    expect((barBox?.y ?? 0) + (barBox?.height ?? 0)).toBeLessThanOrEqual(tabsBox?.y ?? 0)
    await bar.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Site engineer saved')).toBeVisible()
  })

  test('the roles list is cards with a New role button above the tabs', async ({ page }) => {
    const fixture = createCustomRoleFixture('Site engineer')
    await signInAs(page, fixture.owner, fixture.password)

    await page.goto('/settings/roles')

    await expect(page.getByRole('region', { name: 'Built-in roles' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Custom roles' })).toContainText('Site engineer')
    await expect(page.getByRole('button', { name: 'New role' }).last()).toBeInViewport()
  })
})
