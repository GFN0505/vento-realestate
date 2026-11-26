import { expect, type Page } from '@playwright/test'
import { test } from '../support/shell'
import { HOME_GREETING } from '../support/sign-in'

// J-ONB-05 Watch for: server failure (500 with a reference) and connection lost.

const REFERENCE = 'ERR-7F3A-1126'
/** The shape the API answers an unexpected failure with (apps/api app.ts). */
const serverError = {
  json: {
    defined: false,
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'Something went wrong on our side',
    data: { reference: REFERENCE },
  },
}

async function failMeWith500(page: Page) {
  await page.route('**/rpc/account/me', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify(serverError),
    }),
  )
}

test('a server error shows the 500 page with a reference in the server log format', async ({
  as,
}) => {
  const page = await as('sales')
  await failMeWith500(page)
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Something went wrong on our side' }),
  ).toBeVisible()
  await expect(page.getByText(REFERENCE)).toBeVisible()
  expect(REFERENCE).toMatch(/^ERR-[0-9A-F]{4}-\d{4}$/)
  await expect(page).toHaveTitle('Something went wrong · Vento')
})

test('Copy puts the reference on the clipboard and says so', async ({ as }) => {
  const page = await as('sales')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await failMeWith500(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Copy' }).click()

  await expect(page.getByText('Reference copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(REFERENCE)
})

test('Try again recovers once the server is back, without reloading the page', async ({ as }) => {
  const page = await as('sales')
  await failMeWith500(page)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Something went wrong on our side' }),
  ).toBeVisible()

  await page.unroute('**/rpc/account/me')
  await page.getByRole('button', { name: 'Try again' }).click()

  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Something went wrong on our side' })).toHaveCount(
    0,
  )
})

test('the offline banner appears when the network drops and goes when it returns', async ({
  as,
}) => {
  const page = await as('sales')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await page.context().setOffline(true)
  const banner = page.getByRole('alert').filter({ hasText: "You're offline." })
  await expect(banner).toBeVisible({ timeout: 2_000 })
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()

  await page.context().setOffline(false)
  await expect(banner).toHaveCount(0)
})

test('a page whose first request never reaches the server shows the offline page, and Try again loads it', async ({
  as,
}) => {
  const page = await as('sales')
  await page.route('**/rpc/account/me', (route) => route.abort('connectionfailed'))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible()
  await expect(page).toHaveTitle("You're offline · Vento")

  await page.unroute('**/rpc/account/me')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: HOME_GREETING })).toBeVisible()
})
