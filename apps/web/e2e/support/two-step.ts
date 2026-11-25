import { expect, type Page } from '@playwright/test'
import { totpCode } from './totp'

/**
 * Walks the forced two-step setup page: confirm password, read the key shown for manual
 * entry, enter a code from it, tick the backup-codes box. Returns the secret.
 */
export async function completeTwoStepSetup(page: Page, password: string): Promise<string> {
  await expect(page).toHaveURL(/\/two-step\/setup/)
  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible()

  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()

  // The key is grouped in fours for typing by hand: "JBSW Y3DP EHPK 3PXP".
  const key = page.getByText(/^([A-Z2-7]{4} ){3,}[A-Z2-7]{1,4}$/)
  await expect(key).toBeVisible()
  const secret = ((await key.textContent()) ?? '').replace(/\s/g, '')

  await page.getByLabel('6-digit code').fill(totpCode(secret))
  await expect(page.getByRole('heading', { name: 'Two-step is on' })).toBeVisible()

  await page.getByRole('checkbox', { name: "I've saved my backup codes" }).check()
  await page.getByRole('button', { name: 'Continue' }).click()
  return secret
}
