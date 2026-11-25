import { expect, test } from '@playwright/test'

// Foundation check: the web app loads, reaches the API, and the API reaches Postgres.
// The status page moved to /status when the home page began requiring sign-in.
test('status page shows the API and database as connected', async ({ page }) => {
  await page.goto('/status')

  await expect(page.getByRole('heading', { name: 'Vento' })).toBeVisible()
  await expect(page.getByText('Connected')).toHaveCount(2)
})

test('the home page sends a signed-out visitor to sign-in', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
