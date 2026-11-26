import { expect, type Page, test } from '@playwright/test'
import {
  createMultiOrgFixture,
  createTeamFixture,
  type MultiOrgFixture,
  removeMember,
} from '../support/fixtures'
import {
  expectOnOrganization,
  HOME_GREETING,
  signInWithPassword,
  signInWithTotp,
} from '../support/sign-in'
import { nextTotpCode } from '../support/totp'

// J-ONB-05 step 4 and its Watch for: two organizations, two tabs, removal mid-session.

const isMobile = (name: string) => name === 'mobile'

async function switchTo(page: Page, organizationName: string, project: string) {
  if (isMobile(project)) {
    await page
      .getByRole('navigation', { name: 'Tabs' })
      .getByRole('button', { name: 'More' })
      .click()
    await page
      .getByRole('dialog', { name: 'More' })
      .getByRole('region', { name: 'Organizations' })
      .getByRole('button', { name: new RegExp(organizationName) })
      .click()
  } else {
    await page.getByRole('button', { name: /switch organization/ }).click()
    await page.getByRole('menuitem', { name: new RegExp(organizationName) }).click()
  }
}

async function signInTunde(page: Page, fixture: MultiOrgFixture) {
  await signInWithTotp(page, { ...fixture.tunde, password: fixture.password })
}

test('a member of two organizations switches and lands on the other Home with a notice', async ({
  page,
}, testInfo) => {
  const fixture = await createMultiOrgFixture()
  await signInTunde(page, fixture)
  await expectOnOrganization(page, fixture.organizations.a.name)

  await switchTo(page, fixture.organizations.b.name, testInfo.project.name)

  await expect(page.getByText(`Switched to ${fixture.organizations.b.name}`)).toBeVisible()
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  await expectOnOrganization(page, fixture.organizations.b.name)
  await expect(page).toHaveURL(/\/$/)
})

test('a second tab still on the old organization is refused, then reloads into the new one', async ({
  context,
  page,
}, testInfo) => {
  const fixture = await createMultiOrgFixture()
  const { a, b } = fixture.organizations
  await signInTunde(page, fixture)
  const staleTab = page
  const switchingTab = await context.newPage()
  await switchingTab.goto('/')
  await expect(switchingTab.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await switchTo(switchingTab, b.name, testInfo.project.name)
  await expect(switchingTab.getByText(`Switched to ${b.name}`)).toBeVisible()

  // The stale tab still names organization A on every request; the server refuses it.
  const refused = await staleTab.evaluate(async () => {
    const bound = JSON.parse(sessionStorage.getItem('vento-tab-org') ?? '{}') as { id?: string }
    const response = await fetch('/rpc/entities/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vento-organization': bound.id ?? '' },
      body: JSON.stringify({ json: {} }),
    })
    return { status: response.status, body: await response.text() }
  })
  expect(refused.status).toBe(409)
  expect(refused.body).toContain('organization_changed')
  expect(refused.body).not.toContain(a.name)

  // Coming back to the stale tab rechecks who you are and reloads into the new organization.
  await staleTab.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  )
  await expect(staleTab.getByText(`You switched to ${b.name} in another tab.`)).toBeVisible()
  await expectOnOrganization(staleTab, b.name)
})

test('a member removed from one organization signs back in to the other with a notice', async ({
  page,
}) => {
  const fixture = await createMultiOrgFixture()
  const { a, b } = fixture.organizations
  await signInTunde(page, fixture)
  await expectOnOrganization(page, a.name)

  removeMember(fixture.tunde.email)
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  )

  const dialog = page.getByRole('dialog', { name: 'Your session has ended' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(/^Password for/).fill(fixture.password)
  await dialog.getByRole('button', { name: 'Sign in again' }).click()
  await dialog.getByLabel('6-digit code').fill(nextTotpCode(fixture.tunde.totpSecret))

  await expect(page.getByText(`You no longer have access to ${a.name}.`)).toBeVisible()
  await expectOnOrganization(page, b.name)
})

test('a member removed from their only organization sees the no longer have access panel', async ({
  page,
}) => {
  const team = await createTeamFixture()
  const sales = team.members.sales
  if (!sales) throw new Error('No sales member')
  await signInWithPassword(page, { email: sales.email, password: team.password })

  removeMember(sales.email)
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  )

  const dialog = page.getByRole('dialog', { name: 'Your session has ended' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(/^Password for/).fill(team.password)
  await dialog.getByRole('button', { name: 'Sign in again' }).click()

  await expect(
    page.getByRole('heading', { name: `You no longer have access to ${team.organizationName}.` }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})
