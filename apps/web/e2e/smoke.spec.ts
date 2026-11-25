import { expect, test } from '@playwright/test'

// Foundation check: the web app loads, reaches the API, and the API reaches Postgres.
test('home shows the API and database as connected', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Vento' })).toBeVisible()
  await expect(page.getByText('Connected')).toHaveCount(2)
})
