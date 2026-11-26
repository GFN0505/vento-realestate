import { expect } from '@playwright/test'
import { test } from '../support/shell'
import { HOME_GREETING } from '../support/sign-in'

// Settings is for owners and admins; everyone else is told who to ask and no team data moves.

test('a Sales member typing /settings/team gets the 403 naming the owner, and no team request is made', async ({
  as,
}) => {
  const page = await as('sales')
  const teamCalls: string[] = []
  page.on('request', (request) => {
    if (/\/rpc\/(team|members|invitations)\b/.test(request.url())) teamCalls.push(request.url())
  })

  await page.goto('/settings/team')

  await expect(
    page.getByRole('heading', { name: "You don't have access to Settings" }),
  ).toBeVisible()
  await expect(page.getByText(/Ask Olumide Bankole/)).toBeVisible()
  expect(teamCalls).toEqual([])
})

test('Settings is not offered to a Sales member in the sidebar or the command palette', async ({
  as,
}) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Settings/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: /Search or run a command/ }).click()
  await expect(page.getByRole('option', { name: /Go to Team/ })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Invite people' })).toHaveCount(0)
})

test('an owner reaches Team from Settings in the sidebar and from the command palette', async ({
  as,
}, testInfo) => {
  const page = await as('owner')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await page.getByRole('button', { name: /Search or run a command/ }).click()
  await expect(page.getByRole('option', { name: 'Invite people' })).toBeVisible()
  await page.getByRole('option', { name: /Go to Team/ }).click()
  await expect(page).toHaveURL(/\/settings\/team/)
  await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible()
  expect(testInfo.project.name).toBeTruthy()
})
