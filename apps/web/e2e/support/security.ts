import { expect, type Locator, type Page } from '@playwright/test'
import { totpCode } from './totp'

/** My security, from its address; waits for the title. */
export async function openSecurity(page: Page, query = '') {
  await page.goto(`/settings/security${query}`)
  await expect(page.getByRole('heading', { name: 'My security', level: 1 })).toBeVisible()
}

/** The card with this title (My security's cards are named regions). */
export const card = (page: Page, title: string): Locator =>
  page.getByRole('region', { name: title })

/** "Confirm it's you": the password, then Continue. */
export async function confirmItsYou(page: Page, password: string) {
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Password', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden()
}

/** The ten codes in a "Backup codes" list, then ticks "I've saved my backup codes". */
export async function saveBackupCodes(dialog: Locator): Promise<string[]> {
  const items = dialog.getByRole('list', { name: 'Backup codes' }).getByRole('listitem')
  await expect(items).toHaveCount(10)
  const codes = (await items.allTextContents()).map((c) => c.trim())
  await dialog.getByRole('checkbox', { name: "I've saved my backup codes" }).check()
  return codes
}

/**
 * Turn on two-step from the open "Set up two-step sign-in" sheet: password, the key shown for
 * typing by hand, a code from it, then save the backup codes. Returns the secret and the codes.
 */
export async function finishTwoStepSheet(
  page: Page,
  password: string,
): Promise<{ secret: string; backupCodes: string[] }> {
  const sheet = page.getByRole('dialog', { name: 'Set up two-step sign-in' })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('Password', { exact: true }).fill(password)
  await sheet.getByRole('button', { name: 'Continue' }).click()
  const key = sheet.getByText(/^([A-Z2-7]{4} ){3,}[A-Z2-7]{1,4}$/)
  await expect(key).toBeVisible()
  const secret = ((await key.textContent()) ?? '').replace(/\s/g, '')
  await sheet.getByLabel('6-digit code').fill(totpCode(secret))
  const done = page.getByRole('dialog', { name: 'Two-step is on' })
  await expect(done).toBeVisible()
  const backupCodes = await saveBackupCodes(done)
  await done.getByRole('button', { name: 'Done' }).click()
  await expect(done).toBeHidden()
  return { secret, backupCodes }
}

/** A toast by its text (Sonner renders them as list items). */
export const toastWith = (page: Page, text: string | RegExp): Locator =>
  page.getByRole('status').filter({ hasText: text }).or(page.getByText(text)).first()
