import { expect, type Locator, type Page, test } from '@playwright/test'
import { createCustomRoleFixture, createSecurityTeamFixture } from '../support/fixtures'
import { card, openSecurity } from '../support/security'
import { signInAs, signInWithPassword } from '../support/sign-in'

// Axe cannot see a missing focus ring. Each control is reached by keyboard, then its computed
// style must show an outline or a box-shadow ring of real size.

test.skip(({ isMobile }) => isMobile, 'Focus rings are for keyboard users on a laptop')

/** Focuses with the keyboard as the last input, so :focus-visible applies. */
async function focusByKeyboard(page: Page, control: Locator) {
  await page.keyboard.press('Tab')
  await control.focus()
  await expect(control).toBeFocused()
}

async function expectFocusRing(control: Locator) {
  const style = await control.evaluate((el) => {
    const s = getComputedStyle(el)
    return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow }
  })
  const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
  // A ring is a shadow with a size; the transparent zero-size placeholders do not count.
  const ring =
    style.boxShadow !== 'none' &&
    /[1-9]\d*(\.\d+)?px/.test(style.boxShadow.replaceAll('rgba(0, 0, 0, 0)', ''))
  expect(outline || ring, `no focus ring: ${JSON.stringify(style)}`).toBe(true)
}

test('an outline button and a primary button show a focus ring on My security', async ({
  page,
}) => {
  const { members, password } = createSecurityTeamFixture()
  await signInWithPassword(page, { email: members.sales.email, password })
  await openSecurity(page)
  const signIn = card(page, 'Sign-in')

  const outline = signIn.getByRole('button', { name: 'Change password' })
  await focusByKeyboard(page, outline)
  await expectFocusRing(outline)

  const primary = signIn.getByRole('button', { name: 'Turn on' })
  await focusByKeyboard(page, primary)
  await expectFocusRing(primary)
})

test('an input shows a focus ring on Sign in', async ({ page }) => {
  await page.goto('/sign-in')
  const email = page.getByLabel('Work email')

  await focusByKeyboard(page, email)

  await expectFocusRing(email)
})

test('the require-two-step switch shows a focus ring', async ({ page }) => {
  const team = createSecurityTeamFixture()
  await signInAs(page, team.members.owner, team.password)
  await page.goto('/settings/organization')
  const toggle = page.getByRole('switch', { name: 'Require two-step sign-in for everyone' })

  await focusByKeyboard(page, toggle)

  await expectFocusRing(toggle)
})

test('a checkbox in the role grid shows a focus ring', async ({ page }) => {
  const fixture = createCustomRoleFixture('Site engineer')
  await signInAs(page, fixture.owner, fixture.password)
  await page.goto(`/settings/roles/${fixture.role.id}`)
  const box = page.getByRole('checkbox', { name: 'Documents & contracts: Create' })

  await focusByKeyboard(page, box)

  await expectFocusRing(box)
})
